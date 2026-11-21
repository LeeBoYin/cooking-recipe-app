-- 食材正規化（M1a-05，03〈食材正規化〉、16 第三、五、九節）
-- 食材與食譜食材共用同一套對應：使用者自己的對應 → 手機比對字典的結果 → 全站對應 → 都對不到就保留原文，排進背景任務。
-- 背景任務由 `background-jobs` 函式批次交給 AI 選候選，結果寫進全站對應，並回填舊的食材與食譜食材（不改原文）。

---------------------------------------------------------------------------
-- 一、詞的標準寫法（對應表的鍵）：全形轉半形、轉小寫、去掉所有空白
---------------------------------------------------------------------------

create function private.normalize_term(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(normalize(btrim(coalesce(p_text, '')), nfkc), '\s+', '', 'g'));
$$;

---------------------------------------------------------------------------
-- 二、資料表
---------------------------------------------------------------------------

-- 全站共用的對應：只來自 AI 與審查（admin）。ingredient_id 為空 = AI 看過、候選裡沒有合適的（不再重問）。
-- 使用者讀不到；只有資料庫函式能寫。
create table public.ingredient_mappings (
  raw_text_normalized text primary key check (char_length(raw_text_normalized) between 1 and 60),
  ingredient_id text references public.dict_ingredients (id) on delete restrict,
  source text not null check (source in ('ai', 'admin')),
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_timestamps before update on public.ingredient_mappings
  for each row execute function private.set_timestamps();
alter table public.ingredient_mappings enable row level security;
revoke all on public.ingredient_mappings from anon, authenticated;

-- 使用者自己的修正：只影響自己的資料。本人只能讀，寫入走 set_my_ingredient_mapping／clear_my_ingredient_mapping。
create table public.user_ingredient_mappings (
  user_id uuid not null references auth.users (id) on delete cascade,
  raw_text_normalized text not null check (char_length(raw_text_normalized) between 1 and 60),
  ingredient_id text not null references public.dict_ingredients (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, raw_text_normalized)
);
create trigger set_timestamps before update on public.user_ingredient_mappings
  for each row execute function private.set_timestamps();
alter table public.user_ingredient_mappings enable row level security;
revoke all on public.user_ingredient_mappings from anon, authenticated;
grant select on public.user_ingredient_mappings to authenticated;
create policy "本人可以讀" on public.user_ingredient_mappings
  for select to authenticated using (user_id = (select auth.uid()));

-- 背景任務佇列：使用者不能讀寫，只有資料庫函式與 service_role 的函式能動。
-- 現在只有 normalize_ingredients 一種；欄位（attempts、max_attempts、run_after、last_error）留給 M1a-10 的完整重試。
create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('normalize_ingredients')),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 60),
  payload jsonb not null default '{}',
  -- 第一個把這個詞排進來的人：AI 用量算在這個人身上；帳號刪除後為空
  requested_by uuid references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'dead')),
  attempts smallint not null default 0,
  max_attempts smallint not null default 5,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  last_error text check (char_length(last_error) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 同一個詞同時只會有一個在排隊或執行中的任務
create unique index background_jobs_active_key on public.background_jobs (kind, dedupe_key)
  where status in ('pending', 'running');
create index background_jobs_due on public.background_jobs (kind, run_after) where status = 'pending';
create index background_jobs_finished on public.background_jobs (updated_at) where status in ('done', 'dead');
create trigger set_timestamps before update on public.background_jobs
  for each row execute function private.set_timestamps();
alter table public.background_jobs enable row level security;
revoke all on public.background_jobs from anon, authenticated;

-- 背景函式要讀字典挑候選（雲端的 service_role 沒有預設的讀取權限）
grant select on public.dict_ingredients to service_role;

---------------------------------------------------------------------------
-- 三、查對應與排隊
---------------------------------------------------------------------------

-- 對應到的字典 ID：已淘汰的換成取代它的 ID，淘汰了又沒有取代的當作沒有
create function private.live_ingredient_id(p_id text)
returns text
language sql
stable
set search_path = ''
as $$
  select case when d.deprecated then d.replaced_by else d.id end
  from public.dict_ingredients d where d.id = p_id;
$$;

create function private.user_ingredient_mapping(p_user uuid, p_text text)
returns text
language sql
stable
set search_path = ''
as $$
  select private.live_ingredient_id(m.ingredient_id)
  from public.user_ingredient_mappings m
  where m.user_id = p_user and m.raw_text_normalized = private.normalize_term(p_text);
$$;

create function private.global_ingredient_mapping(p_text text)
returns text
language sql
stable
set search_path = ''
as $$
  select private.live_ingredient_id(m.ingredient_id)
  from public.ingredient_mappings m
  where m.raw_text_normalized = private.normalize_term(p_text);
$$;

-- 把對不到的詞排進佇列。已經有任何對應（含「AI 說沒有合適的」）、全站預算用完、AI 關閉、佇列太長都不排；
-- 詞太長或只有數字也不排。不排只是這次不處理，下次再輸入同一個詞還會再試。
create function private.enqueue_normalization(p_user uuid, p_text text)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_key text := private.normalize_term(p_text);
begin
  if p_user is null or v_key = '' or char_length(v_key) > 60 or v_key ~ '^[0-9./]+$' then
    return;
  end if;
  if exists (select 1 from public.ingredient_mappings where raw_text_normalized = v_key)
     or exists (select 1 from public.user_ingredient_mappings where user_id = p_user and raw_text_normalized = v_key) then
    return;
  end if;
  if not (select c.ai_enabled from public.app_config c where c.id)
     or private.ai_budget_state(now()) ->> 'state' = 'exhausted' then
    return;
  end if;
  if (select count(*) from public.background_jobs where kind = 'normalize_ingredients' and status = 'pending') >= 1000 then
    return;
  end if;
  -- 最近 7 天才徹底失敗過的詞，先不要一直重排
  if exists (
    select 1 from public.background_jobs
    where kind = 'normalize_ingredients' and dedupe_key = v_key and status = 'dead'
      and updated_at > now() - interval '7 days'
  ) then
    return;
  end if;
  insert into public.background_jobs (kind, dedupe_key, payload, requested_by)
  values ('normalize_ingredients', v_key, jsonb_build_object('text', left(btrim(p_text), 60)), p_user)
  on conflict (kind, dedupe_key) where status in ('pending', 'running') do nothing;
end;
$$;

---------------------------------------------------------------------------
-- 四、食譜食材的格式：每列多一個選填的 name（解析器拆出的食材名字，對應與回填用）
---------------------------------------------------------------------------

create or replace function private.is_recipe_ingredients(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extensions.jsonb_matches_schema(
    '{
      "type": "array",
      "maxItems": 200,
      "items": {
        "type": "object",
        "required": ["id", "raw_text", "optional"],
        "properties": {
          "id": { "type": "string", "minLength": 1, "maxLength": 64 },
          "raw_text": { "type": "string", "minLength": 1, "maxLength": 200 },
          "name": { "type": "string", "minLength": 1, "maxLength": 60 },
          "ingredient_id": { "type": "string", "maxLength": 64 },
          "amount": { "type": "number", "minimum": 0 },
          "amount_max": { "type": "number", "minimum": 0 },
          "unit": { "type": "string", "maxLength": 20 },
          "optional": { "type": "boolean" },
          "group": { "type": "string", "maxLength": 40 },
          "declared_allergen_ids": { "type": "array", "maxItems": 30, "items": { "type": "string", "maxLength": 64 } },
          "declared_traits": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 32 } }
        },
        "additionalProperties": false
      }
    }'::json,
    value
  );
$$;

-- 存檔時清理食材欄位（M0-21b 的檢查）之後，再依對應補 ingredient_id：
--   有使用者自己的對應 → 用它（優先於一切）；已經有合法的 ingredient_id（手機比對字典的結果）→ 保留；
--   否則查全站對應；都沒有就排進背景任務。只動 ingredient_id，不碰原文。
-- 由 save_recipe（本人，auth.uid()）與 backfill_recipe_ingredients（service_role，沒有使用者：只查全站對應、不排隊）呼叫。
create or replace function private.clean_recipe_ingredients(p_ingredients jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_clean jsonb;
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_name text;
  v_id text;
begin
  v_clean := coalesce((
    select jsonb_agg(
      case when jsonb_typeof(x.item) <> 'object' then x.item else
        x.item
          - case when jsonb_typeof(x.item->'ingredient_id') is distinct from 'string'
                      or not exists (select 1 from public.dict_ingredients d where d.id = x.item->>'ingredient_id')
                 then 'ingredient_id' else '' end
          - case when jsonb_typeof(x.item->'unit') is distinct from 'string'
                      or not private.is_unit_code(x.item->>'unit')
                 then 'unit' else '' end
          - case when jsonb_typeof(x.item->'amount') is distinct from 'number'
                      or (x.item->>'amount')::numeric <= 0
                 then 'amount' else '' end
          - case when jsonb_typeof(x.item->'amount_max') is distinct from 'number'
                      or (x.item->>'amount_max')::numeric <= 0
                      or jsonb_typeof(x.item->'amount') is distinct from 'number'
                      or (x.item->>'amount')::numeric <= 0
                      or (x.item->>'amount_max')::numeric < (x.item->>'amount')::numeric
                 then 'amount_max' else '' end
      end
      order by x.ord
    )
    from jsonb_array_elements(p_ingredients) with ordinality as x(item, ord)
  ), '[]'::jsonb);

  for v_item in select e.value from jsonb_array_elements(v_clean) as e loop
    if jsonb_typeof(v_item) = 'object' then
      if jsonb_typeof(v_item->'name') = 'string' then
        v_name := v_item->>'name';
        v_id := private.user_ingredient_mapping(v_user, v_name);
        if v_id is not null then
          v_item := jsonb_set(v_item, '{ingredient_id}', to_jsonb(v_id));
        elsif v_item->>'ingredient_id' is null then
          v_id := private.global_ingredient_mapping(v_name);
          if v_id is not null then
            v_item := jsonb_set(v_item, '{ingredient_id}', to_jsonb(v_id));
          else
            perform private.enqueue_normalization(v_user, v_name);
          end if;
        end if;
      end if;
    end if;
    v_out := v_out || jsonb_build_array(v_item);
  end loop;
  return v_out;
end;
$$;

---------------------------------------------------------------------------
-- 五、add_pantry_items：沒有 ingredient_id 的食材照同樣的順序決定
---------------------------------------------------------------------------

-- 回填用的更新不能讓 updated_at 變動（作者存食譜時用 updated_at 判斷有沒有被別處改過）：
-- 交易內設了 app.keep_updated_at 就保留原值。只有下面的資料庫函式會設。
create or replace function private.set_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := old.created_at;
  new.updated_at := case when current_setting('app.keep_updated_at', true) = 'on' then old.updated_at else now() end;
  return new;
end;
$$;

create or replace function public.add_pantry_items(p_kitchen_id uuid, p_items jsonb)
returns setof public.pantry_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_ingredient_id text;
  v_zone text;
  v_timezone text;
  v_today date;
  v_user uuid := (select auth.uid());
  v_row public.pantry_items;
begin
  if not private.is_active_user() then
    raise exception 'account_not_active' using errcode = '42501';
  end if;
  if not private.is_kitchen_member(p_kitchen_id) then
    raise exception 'not_a_kitchen_member' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  select timezone into v_timezone from public.kitchens where id = p_kitchen_id;
  v_today := (now() at time zone v_timezone)::date;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_id := (v_item ->> 'id')::uuid;
    if v_id is null then
      raise exception 'invalid_items' using errcode = '22023';
    end if;

    -- 同一個 id 已經寫入過（重送）：原樣回傳
    select * into v_row from public.pantry_items where id = v_id and kitchen_id = p_kitchen_id;
    if found then
      return next v_row;
      continue;
    end if;

    -- 食材對應的順序：使用者自己的對應 → 手機送來的 ingredient_id（比對字典的結果）→ 全站對應 → 保留原文並排進背景任務
    v_ingredient_id := coalesce(
      private.user_ingredient_mapping(v_user, v_item ->> 'raw_name'),
      nullif(v_item ->> 'ingredient_id', '')
    );
    if v_ingredient_id is null and v_item ->> 'raw_name' is not null then
      v_ingredient_id := private.global_ingredient_mapping(v_item ->> 'raw_name');
      if v_ingredient_id is null then
        perform private.enqueue_normalization(v_user, v_item ->> 'raw_name');
      end if;
    end if;

    v_zone := nullif(v_item ->> 'zone', '');
    if v_zone is null then
      select default_storage into v_zone from public.dict_ingredients where id = v_ingredient_id;
      v_zone := coalesce(v_zone, 'pantry');
    end if;

    insert into public.pantry_items as p (
      id, kitchen_id, created_by, ingredient_id, raw_name, zone, added_on,
      want_to_use_soon, expires_at, date_type, note
    ) values (
      v_id, p_kitchen_id, v_user, v_ingredient_id, v_item ->> 'raw_name', v_zone, v_today,
      coalesce((v_item ->> 'want_to_use_soon')::boolean, false),
      (v_item ->> 'expires_at')::date, v_item ->> 'date_type', v_item ->> 'note'
    )
    on conflict (kitchen_id, ingredient_id) where status = 'active' and ingredient_id is not null
    do update set
      added_on = excluded.added_on,
      expires_at = case
        when excluded.expires_at is not null and (p.expires_at is null or excluded.expires_at < p.expires_at)
          then excluded.expires_at else p.expires_at end,
      date_type = case
        when excluded.expires_at is not null and (p.expires_at is null or excluded.expires_at < p.expires_at)
          then excluded.date_type else p.date_type end
    returning * into v_row;

    return next v_row;
  end loop;
end;
$$;

---------------------------------------------------------------------------
-- 六、把對應回填到已經存下的食材與食譜食材（只改 ingredient_id，不改原文；不動 updated_at）
---------------------------------------------------------------------------

-- p_user 為空：全站對應，只補「還沒有 ingredient_id」的，並略過自己有同一個詞對應的人。
-- p_user 有值：那個人自己的修正，只改他自己的資料，會蓋掉原本的 ingredient_id。
create function private.apply_ingredient_mapping(p_key text, p_ingredient_id text, p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('app.keep_updated_at', 'on', true);

  -- 食材：同一個廚房、同一個 ingredient_id 只能有一筆「有」的，所以每個廚房最多改一筆，且廚房裡已經有同樣食材的略過
  update public.pantry_items p
     set ingredient_id = p_ingredient_id
   where p.id in (
     select distinct on (q.kitchen_id) q.id
     from public.pantry_items q
     where private.normalize_term(q.raw_name) = p_key
       and (case when p_user is null then q.ingredient_id is null
                 else q.created_by = p_user and q.ingredient_id is distinct from p_ingredient_id end)
       and (p_user is not null or not exists (
         select 1 from public.user_ingredient_mappings u
         where u.user_id = q.created_by and u.raw_text_normalized = p_key))
       and (q.status <> 'active' or not exists (
         select 1 from public.pantry_items o
         where o.kitchen_id = q.kitchen_id and o.status = 'active' and o.ingredient_id = p_ingredient_id and o.id <> q.id))
     order by q.kitchen_id, q.added_on desc, q.id
   );

  -- 食譜：每列食材用 name 比對
  with changed as (
    select r.id,
           jsonb_agg(
             case when private.recipe_item_matches(t.item, p_key, p_ingredient_id, p_user)
                  then jsonb_set(t.item, '{ingredient_id}', to_jsonb(p_ingredient_id))
                  else t.item end
             order by t.ord) as ingredients
    from public.recipes r
    cross join lateral jsonb_array_elements(r.ingredients) with ordinality as t(item, ord)
    where r.deleted_at is null
      and (p_user is null or r.user_id = p_user)
      and (p_user is not null or not exists (
        select 1 from public.user_ingredient_mappings u
        where u.user_id = r.user_id and u.raw_text_normalized = p_key))
    group by r.id
    having bool_or(private.recipe_item_matches(t.item, p_key, p_ingredient_id, p_user))
  )
  update public.recipes r
     set ingredients = changed.ingredients,
         ingredient_ids = private.recipe_ingredient_ids(changed.ingredients, r.ai_tags)
    from changed
   where r.id = changed.id;

  perform set_config('app.keep_updated_at', 'off', true);
end;
$$;

create function private.recipe_item_matches(p_item jsonb, p_key text, p_ingredient_id text, p_user uuid)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_item) <> 'object' or jsonb_typeof(p_item -> 'name') is distinct from 'string' then
    return false;
  end if;
  if private.normalize_term(p_item ->> 'name') <> p_key then
    return false;
  end if;
  if p_user is null then
    return p_item ->> 'ingredient_id' is null;
  end if;
  return p_item ->> 'ingredient_id' is distinct from p_ingredient_id;
end;
$$;

revoke execute on function private.apply_ingredient_mapping(text, text, uuid) from public, anon, authenticated;

---------------------------------------------------------------------------
-- 七、使用者手動修正（只影響自己的資料）
---------------------------------------------------------------------------

create function public.set_my_ingredient_mapping(p_raw_text text, p_ingredient_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_key text := private.normalize_term(p_raw_text);
begin
  if not private.is_active_user() then
    raise exception 'account_not_active' using errcode = '42501';
  end if;
  if v_key = '' or char_length(v_key) > 60 then
    raise exception 'invalid_text' using errcode = '22023';
  end if;
  if not exists (select 1 from public.dict_ingredients d where d.id = p_ingredient_id and not d.deprecated) then
    raise exception 'unknown_ingredient' using errcode = '22023';
  end if;

  insert into public.user_ingredient_mappings (user_id, raw_text_normalized, ingredient_id)
  values (v_user, v_key, p_ingredient_id)
  on conflict (user_id, raw_text_normalized) do update set ingredient_id = excluded.ingredient_id;

  perform private.apply_ingredient_mapping(v_key, p_ingredient_id, v_user);
end;
$$;

-- 拿掉自己的修正：以後這個詞回到全站對應與字典；已經存下的食材維持現狀
create function public.clear_my_ingredient_mapping(p_raw_text text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.user_ingredient_mappings
  where user_id = (select auth.uid()) and raw_text_normalized = private.normalize_term(p_raw_text);
$$;

revoke execute on function public.set_my_ingredient_mapping(text, text) from public, anon;
revoke execute on function public.clear_my_ingredient_mapping(text) from public, anon;
grant execute on function public.set_my_ingredient_mapping(text, text) to authenticated;
grant execute on function public.clear_my_ingredient_mapping(text) to authenticated;

---------------------------------------------------------------------------
-- 八、背景任務的執行（只給 background-jobs 函式，用 service_role 呼叫）
---------------------------------------------------------------------------

-- 領一批到期的任務：標成執行中、次數加一。執行超過 10 分鐘還沒回報的視為中斷，可以再領（次數已滿的直接放棄）。
create function public.claim_background_jobs(p_kind text, p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jobs jsonb;
begin
  update public.background_jobs
     set status = 'dead', last_error = 'stalled'
   where kind = p_kind and status = 'running' and locked_at < now() - interval '10 minutes' and attempts >= max_attempts;

  with picked as (
    select id from public.background_jobs
    where kind = p_kind
      and ((status = 'pending' and run_after <= now())
        or (status = 'running' and locked_at < now() - interval '10 minutes'))
    order by run_after, created_at
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  ), claimed as (
    update public.background_jobs j
       set status = 'running', attempts = j.attempts + 1, locked_at = now()
      from picked
     where j.id = picked.id
    returning j.id, j.dedupe_key, j.payload, j.requested_by, j.attempts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'key', dedupe_key, 'text', payload ->> 'text', 'requested_by', requested_by, 'attempts', attempts)), '[]')
    into v_jobs from claimed;
  return v_jobs;
end;
$$;

-- 回報結果：p_results 是 [{id, ingredient_id（沒有合適的就是 null）, model}]。
-- 寫進全站對應（已經有的不蓋掉，審查的優先），有對到的回填食材與食譜食材，任務標成完成。
create function public.complete_normalization_jobs(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r jsonb;
  v_job public.background_jobs;
  v_id text;
  v_done integer := 0;
begin
  for v_r in select * from jsonb_array_elements(p_results) loop
    select * into v_job from public.background_jobs
     where id = (v_r ->> 'id')::uuid and kind = 'normalize_ingredients' and status = 'running'
     for update;
    if not found then
      continue;
    end if;
    v_id := nullif(v_r ->> 'ingredient_id', '');
    if v_id is not null and not exists (select 1 from public.dict_ingredients d where d.id = v_id and not d.deprecated) then
      update public.background_jobs set status = 'dead', last_error = 'invalid_id' where id = v_job.id;
      continue;
    end if;

    insert into public.ingredient_mappings (raw_text_normalized, ingredient_id, source, model)
    values (v_job.dedupe_key, v_id, 'ai', left(v_r ->> 'model', 60))
    on conflict (raw_text_normalized) do nothing;

    -- 回填用「現在全站對應」的值（可能是別人先寫入的），而不是這次 AI 的
    v_id := private.global_ingredient_mapping(v_job.dedupe_key);
    if v_id is not null then
      perform private.apply_ingredient_mapping(v_job.dedupe_key, v_id, null);
    end if;
    update public.background_jobs set status = 'done', last_error = null, locked_at = null where id = v_job.id;
    v_done := v_done + 1;
  end loop;
  return v_done;
end;
$$;

-- 失敗：還有次數就退避（2、4、8、16 分鐘）再試，否則放棄。只留錯誤代號。
create function public.fail_background_job(p_id uuid, p_code text, p_retry boolean default true)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.background_jobs
     set status = case when p_retry and attempts < max_attempts then 'pending' else 'dead' end,
         run_after = now() + make_interval(mins => power(2, attempts)::integer),
         locked_at = null,
         last_error = left(p_code, 40)
   where id = p_id and status = 'running';
$$;

-- 這次不能處理（預算用完、AI 暫停…）：放回佇列，不算一次嘗試
create function public.release_background_jobs(p_ids uuid[], p_delay_seconds integer default 0)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.background_jobs
     set status = 'pending', attempts = greatest(attempts - 1, 0), locked_at = null,
         run_after = now() + make_interval(secs => greatest(p_delay_seconds, 0))
   where id = any (p_ids) and status = 'running';
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'claim_background_jobs(text, integer)',
    'complete_normalization_jobs(jsonb)',
    'fail_background_job(uuid, text, boolean)',
    'release_background_jobs(uuid[], integer)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

---------------------------------------------------------------------------
-- 九、排程：每分鐘看有沒有該處理的任務，有就用 pg_net 叫 background-jobs 函式
---------------------------------------------------------------------------

-- 累積到 20 個詞、或最早的已經等超過 2 分鐘才叫（累積幾個詞一起送，少呼叫幾次 AI）。
-- 函式網址與金鑰放在 Supabase Vault（名稱 background_jobs_url、background_jobs_token），不進程式碼；沒設就什麼都不做。
create function private.dispatch_background_jobs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  if not exists (
    select 1 from public.background_jobs j
    where j.status = 'pending' and j.run_after <= now()
      and (j.created_at <= now() - interval '2 minutes'
           or (select count(*) from public.background_jobs b where b.status = 'pending' and b.run_after <= now()) >= 20)
  ) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'background_jobs_url';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'background_jobs_token';
  if v_url is null or v_token is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;
revoke execute on function private.dispatch_background_jobs() from public, anon, authenticated;

create function private.purge_background_jobs()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.background_jobs
  where (status = 'done' and updated_at < now() - interval '7 days')
     or (status = 'dead' and updated_at < now() - interval '30 days');
$$;
revoke execute on function private.purge_background_jobs() from public, anon, authenticated;

select cron.schedule('background-jobs', '* * * * *', $$select private.dispatch_background_jobs()$$);
select cron.schedule('purge-background-jobs', '40 19 * * *', $$select private.purge_background_jobs()$$);
