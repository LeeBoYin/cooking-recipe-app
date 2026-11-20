-- 食譜（05 Recipe、RecipePrivate；16 第三～五節）：
-- app_config、recipes、recipe_private、can_view_recipe、save_recipe／publish_recipe／delete_recipe／restore_recipe，
-- 並補上食譜與步驟照片的權限、張數上限與 Storage 讀取規則（接續 20261120000007_photos.sql）。
-- 食譜只經資料庫函式寫入：衍生欄位由資料庫算，儲存時比對 updated_at。

---------------------------------------------------------------------------
-- app_config：單列設定，只有後端（資料庫函式與 Edge Function）讀得到
---------------------------------------------------------------------------

create table public.app_config (
  id boolean primary key default true check (id),
  -- 使用者內容的長度上限（字數）
  text_limits jsonb not null default '{"title": 80, "story": 2000, "tips": 1000, "step": 500, "comment": 500, "status": 60, "bio": 100}'
    check (extensions.jsonb_matches_schema(
      '{
        "type": "object",
        "required": ["title", "story", "tips", "step", "comment", "status", "bio"],
        "additionalProperties": { "type": "integer", "minimum": 1 }
      }'::json,
      text_limits
    )),
  -- 每篇食譜最多幾張（含步驟照、不含又做了一次的照片）、每次又做了一次最多幾張
  photo_limits jsonb not null default '{"per_recipe": 10, "per_cook_note": 3}'
    check (extensions.jsonb_matches_schema(
      '{
        "type": "object",
        "required": ["per_recipe", "per_cook_note"],
        "properties": {
          "per_recipe": { "type": "integer", "minimum": 1 },
          "per_cook_note": { "type": "integer", "minimum": 1 }
        },
        "additionalProperties": false
      }'::json,
      photo_limits
    )),
  -- 刪除的食譜保留幾天可以復原
  soft_delete_retention_days integer not null default 30 check (soft_delete_retention_days between 1 and 365),
  updated_at timestamptz not null default now()
);

insert into public.app_config default values;

alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

create trigger set_updated_at before update on public.app_config
  for each row execute function private.set_updated_at();

---------------------------------------------------------------------------
-- 內嵌 JSON 的格式檢查（pg_jsonschema）。key 一律 snake_case。
---------------------------------------------------------------------------

create function private.is_recipe_ingredients(value jsonb)
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

create function private.is_recipe_steps(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extensions.jsonb_matches_schema(
    '{
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "required": ["id", "order", "text"],
        "properties": {
          "id": { "type": "string", "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" },
          "order": { "type": "integer", "minimum": 0 },
          "text": { "type": "string", "maxLength": 2000 },
          "timer_seconds": { "type": "integer", "minimum": 1, "maximum": 172800 },
          "techniques": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 64 } },
          "equipment_type_ids": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 64 } },
          "target_temp": {
            "type": "object",
            "required": ["value", "unit"],
            "properties": {
              "value": { "type": "number" },
              "unit": { "enum": ["C", "F"] }
            },
            "additionalProperties": false
          }
        },
        "additionalProperties": false
      }
    }'::json,
    value
  );
$$;

create function private.is_recipe_cook_notes(value jsonb)
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
        "required": ["id", "cooked_on"],
        "properties": {
          "id": { "type": "string", "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" },
          "cooked_on": { "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
          "text": { "type": "string", "maxLength": 500 },
          "rating": { "enum": ["loved", "ok", "flop"] }
        },
        "additionalProperties": false
      }
    }'::json,
    value
  );
$$;

-- 難易度：五個面向 1–5，overall 1–10 由資料庫算
create function private.is_recipe_difficulty(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["ingredients", "equipment", "time", "technique", "failure_risk", "overall", "source"],
      "properties": {
        "ingredients": { "type": "integer", "minimum": 1, "maximum": 5 },
        "equipment": { "type": "integer", "minimum": 1, "maximum": 5 },
        "time": { "type": "integer", "minimum": 1, "maximum": 5 },
        "technique": { "type": "integer", "minimum": 1, "maximum": 5 },
        "failure_risk": { "type": "integer", "minimum": 1, "maximum": 5 },
        "overall": { "type": "integer", "minimum": 1, "maximum": 10 },
        "source": { "enum": ["author", "ai"] },
        "estimated_from": { "enum": ["recipe", "text"] }
      },
      "additionalProperties": false
    }'::json,
    value
  );
$$;

create function private.is_recipe_ai_tags(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["confirmed_by_user"],
      "properties": {
        "cuisine_keys": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 64 } },
        "main_ingredient_ids": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 64 } },
        "techniques": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 64 } },
        "equipment_type_ids": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 64 } },
        "flavors": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 64 } },
        "confirmed_by_user": { "type": "boolean" }
      },
      "additionalProperties": false
    }'::json,
    value
  );
$$;

create function private.is_recipe_source(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": { "enum": ["original", "url", "friend", "share_link", "ai", "external_ai"] },
        "share_link_id": { "type": "string", "maxLength": 64 },
        "url": { "type": "string", "maxLength": 2000 },
        "from_user_id": { "type": "string", "maxLength": 64 },
        "from_user_name": { "type": "string", "maxLength": 60 }
      },
      "additionalProperties": false
    }'::json,
    value
  );
$$;

create function private.is_recipe_diners(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extensions.jsonb_matches_schema(
    '{
      "type": "array",
      "maxItems": 50,
      "items": {
        "type": "object",
        "required": ["type"],
        "properties": {
          "type": { "enum": ["member", "household", "friend", "text"] },
          "user_id": { "type": "string", "maxLength": 64 },
          "household_profile_id": { "type": "string", "maxLength": 64 },
          "name": { "type": "string", "minLength": 1, "maxLength": 40 }
        },
        "additionalProperties": false
      }
    }'::json,
    value
  );
$$;

---------------------------------------------------------------------------
-- recipes
---------------------------------------------------------------------------

create table public.recipes (
  id uuid primary key check (private.is_uuid_v7(id)),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_via text not null default 'app' check (created_via in ('app', 'external_ai')),
  -- 下面所有 jsonb 欄位的格式版本；改格式時依它轉換舊資料
  schema_version smallint not null default 1,
  lang text not null default 'zh-TW' check (lang ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  -- draft：編輯頁自動存的草稿，只有作者看得到
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  title text,
  story text,
  highlights text[] not null default '{}' check (
    highlights <@ array['first_time', 'hosted_friends', 'improved', 'family_favorite', 'festive', 'make_again', 'funny_flop']
  ),
  rating text check (rating in ('loved', 'ok', 'flop')),
  cooked_at timestamptz,
  -- 衍生：cooked_at 依廚房時區算出的日期，cooked_at 改變時才重算
  cooked_on date,
  kitchen_id uuid references public.kitchens (id) on delete set null,
  cook_notes jsonb not null default '[]' check (private.is_recipe_cook_notes(cook_notes)),
  -- 衍生：cooked_on 加上每一次又做了一次的日期
  cooked_dates date[] not null default '{}',
  servings smallint check (servings between 1 and 100),
  difficulty jsonb check (private.is_recipe_difficulty(difficulty)),
  ingredients jsonb not null default '[]' check (private.is_recipe_ingredients(ingredients)),
  steps jsonb not null default '[]' check (private.is_recipe_steps(steps)),
  tips text,
  cuisine_keys text[],
  dish_type_keys text[],
  tags text[] not null default '{}',
  -- 衍生：由步驟彙整
  equipment_type_ids text[] not null default '{}',
  techniques text[] not null default '{}',
  -- 衍生：食材清單對應到字典的項目；沒有時用 AI 補的主食材
  ingredient_ids text[] not null default '{}',
  equipment_used_ids text[] not null default '{}',
  ai_tags jsonb check (private.is_recipe_ai_tags(ai_tags)),
  source jsonb check (private.is_recipe_source(source)),
  safety_warnings text[] not null default '{}',
  parent_recipe_id uuid references public.recipes (id) on delete set null,
  -- 做法（食材、步驟、料理筆記、份量、難易度）每次修改加一
  version integer not null default 1,
  visibility text not null default 'friends' check (visibility in ('private', 'household', 'friends')),
  check (status = 'draft' or published_at is not null),
  check (parent_recipe_id is distinct from id)
);

-- 草稿匣
create index recipes_user_status on public.recipes (user_id, status);
-- 朋友的動態：只含已發佈、未刪除的
create index recipes_feed on public.recipes (user_id, published_at desc)
  where status = 'published' and deleted_at is null;
create index recipes_cooked_dates on public.recipes using gin (cooked_dates);
create index recipes_highlights on public.recipes using gin (highlights);
create index recipes_ingredient_ids on public.recipes using gin (ingredient_ids);
create index recipes_equipment_used_ids on public.recipes using gin (equipment_used_ids);
create index recipes_parent on public.recipes (parent_recipe_id) where parent_recipe_id is not null;
create index recipes_kitchen on public.recipes (kitchen_id) where kitchen_id is not null;

create trigger set_timestamps before update on public.recipes
  for each row execute function private.set_timestamps();

-- 因為記錄食譜而移除的食材：食譜真正刪除時改成空值
alter table public.pantry_items
  add constraint pantry_items_removed_with_recipe_fk
  foreign key (removed_with_recipe_id) references public.recipes (id) on delete set null;

-- 食譜真正刪除時，食譜與步驟的照片資料列一起刪（檔案由維護工作清掉孤兒檔）
create function private.recipe_delete_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.photos
    where (owner_type = 'recipe' and owner_id = old.id)
       or (owner_type = 'recipe_step' and recipe_id = old.id);
  return old;
end;
$$;

create trigger recipes_delete_photos after delete on public.recipes
  for each row execute function private.recipe_delete_photos();

---------------------------------------------------------------------------
-- recipe_private：只有作者能讀寫（RLS 以列為單位，所以另開一張表）
---------------------------------------------------------------------------

create table public.recipe_private (
  recipe_id uuid primary key references public.recipes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 「用說的」的口述原文：{ text, lang, at }
  dictation jsonb check (extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["text", "lang", "at"],
      "properties": {
        "text": { "type": "string", "maxLength": 5000 },
        "lang": { "type": "string", "maxLength": 20 },
        "at": { "type": "string", "maxLength": 40 }
      },
      "additionalProperties": false
    }'::json,
    dictation
  )),
  -- 一起吃的人
  diners jsonb not null default '[]' check (private.is_recipe_diners(diners)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_timestamps before update on public.recipe_private
  for each row execute function private.set_timestamps();

---------------------------------------------------------------------------
-- 權限判斷
---------------------------------------------------------------------------

-- 好友關係在 M2 建好後換成真正的判斷
create function private.is_friend(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

-- 讀得到這篇食譜：作者；已發佈、沒刪除，且可見範圍涵蓋他的家人（同屬任一廚房）或好友。草稿與私人的只有作者
create function private.can_view_recipe(p_viewer uuid, p_recipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.recipes r
    where r.id = p_recipe_id
      and (
        r.user_id = p_viewer
        or (
          r.status = 'published' and r.deleted_at is null and r.visibility <> 'private'
          and (
            private.shares_kitchen(r.user_id, p_viewer)
            or (r.visibility = 'friends' and private.is_friend(r.user_id, p_viewer))
          )
        )
      )
  );
$$;

revoke execute on function private.is_friend(uuid, uuid) from public;
revoke execute on function private.can_view_recipe(uuid, uuid) from public;
grant execute on function private.is_friend(uuid, uuid) to authenticated;
grant execute on function private.can_view_recipe(uuid, uuid) to authenticated;

---------------------------------------------------------------------------
-- 權限（RLS）與欄位授權：App 只能讀；寫入全部經資料庫函式
---------------------------------------------------------------------------

alter table public.recipes enable row level security;
revoke all on public.recipes from anon, authenticated;
grant select on public.recipes to authenticated;

create policy "讀得到的食譜" on public.recipes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.can_view_recipe((select auth.uid()), id)
  );

alter table public.recipe_private enable row level security;
revoke all on public.recipe_private from anon, authenticated;
grant select, delete on public.recipe_private to authenticated;
grant insert (recipe_id, user_id, dictation, diners) on public.recipe_private to authenticated;
grant update (dictation, diners) on public.recipe_private to authenticated;

create policy "作者讀私人資料" on public.recipe_private
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "作者新增私人資料" on public.recipe_private
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and private.is_active_user()
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = (select auth.uid()))
  );
create policy "作者改私人資料" on public.recipe_private
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.is_active_user());
create policy "作者刪私人資料" on public.recipe_private
  for delete to authenticated
  using (user_id = (select auth.uid()) and private.is_active_user());

---------------------------------------------------------------------------
-- 資料庫函式
---------------------------------------------------------------------------

-- 難易度總分：五個面向平均後換算成 1–10（03）。缺面向時回傳空值
create function private.difficulty_overall(d jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when d ?& array['ingredients', 'equipment', 'time', 'technique', 'failure_risk'] then
      round(
        1 + 9 * (
          ((d->>'ingredients')::numeric + (d->>'equipment')::numeric + (d->>'time')::numeric
            + (d->>'technique')::numeric + (d->>'failure_risk')::numeric) / 5 - 1
        ) / 4
      )::integer
  end;
$$;

-- 食材清單對應到字典的食材 ID（依出現順序、不重複）；已淘汰的換成取代它的 ID。
-- 食材清單沒有任何對應到字典的項目時，用 AI 補的主食材。字典裡找不到的 ID 當成對應不到。
create function private.recipe_ingredient_ids(p_ingredients jsonb, p_ai_tags jsonb)
returns text[]
language sql
stable
set search_path = ''
as $$
  with listed as (
    select coalesce(d.replaced_by, d.id) as id, min(x.ord) as ord
    from jsonb_array_elements(p_ingredients) with ordinality as x(item, ord)
    join public.dict_ingredients d on d.id = x.item->>'ingredient_id'
    group by 1
  ), ai as (
    select coalesce(d.replaced_by, d.id) as id, min(x.ord) as ord
    from jsonb_array_elements_text(coalesce(p_ai_tags->'main_ingredient_ids', '[]')) with ordinality as x(id, ord)
    join public.dict_ingredients d on d.id = x.id
    group by 1
  )
  select coalesce(
    (select array_agg(id order by ord) from listed),
    (select array_agg(id order by ord) from ai),
    '{}'
  );
$$;

-- 步驟彙整的廚具類型（不重複、依字典過濾）
create function private.recipe_step_equipment_ids(p_steps jsonb)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct coalesce(d.replaced_by, d.id) order by coalesce(d.replaced_by, d.id)), '{}')
  from jsonb_array_elements(p_steps) s,
       jsonb_array_elements_text(coalesce(s->'equipment_type_ids', '[]')) e
  join public.dict_equipment_types d on d.id = e;
$$;

-- 步驟彙整的手法
create function private.recipe_step_techniques(p_steps jsonb)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct coalesce(d.replaced_by, d.id) order by coalesce(d.replaced_by, d.id)), '{}')
  from jsonb_array_elements(p_steps) s,
       jsonb_array_elements_text(coalesce(s->'techniques', '[]')) t
  join public.dict_techniques d on d.id = t;
$$;

-- 超過長度上限就拒絕，並告訴使用者還差多少：text_too_long:欄位:上限:超過幾字
create function private.check_text_limit(p_field text, p_value text, p_limit integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is not null and char_length(p_value) > p_limit then
    raise exception 'text_too_long:%:%:%', p_field, p_limit, char_length(p_value) - p_limit
      using errcode = '22001';
  end if;
end;
$$;

-- 新增或更新食譜（含草稿）。
-- p_recipe：JSON 物件，id 必填（手機產生的 UUID v7）；只送有改的欄位，沒送的維持原值。
--   可以寫的欄位：lang、title、story、highlights、rating、cooked_at、kitchen_id、cook_notes、servings、difficulty、
--   ingredients、steps、tips、cuisine_keys、dish_type_keys、tags、equipment_used_ids、ai_tags、source、
--   visibility、parent_recipe_id。狀態、發佈時間、版本與衍生欄位由資料庫決定，送了會被拒絕。
-- p_expected_updated_at：更新時必填，要和資料庫目前的 updated_at 一致，不一致就拒絕（recipe_conflict）；
--   id 還不存在時新增一篇草稿（廚房預設為目前的廚房）。
-- p_private：選填，{ dictation, diners }，同一個交易存進 recipe_private。
create function public.save_recipe(
  p_recipe jsonb,
  p_expected_updated_at timestamptz default null,
  p_private jsonb default null
)
returns public.recipes
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_writable constant text[] := array[
    'lang', 'title', 'story', 'highlights', 'rating', 'cooked_at', 'kitchen_id', 'cook_notes', 'servings',
    'difficulty', 'ingredients', 'steps', 'tips', 'cuisine_keys', 'dish_type_keys', 'tags', 'equipment_used_ids',
    'ai_tags', 'source', 'visibility', 'parent_recipe_id'
  ];
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_key text;
  v_patch jsonb;
  v_old public.recipes;
  v_new public.recipes;
  v_is_new boolean := false;
  v_limits jsonb;
  v_timezone text;
  v_step jsonb;
begin
  if not private.is_active_user() then
    raise exception 'account_not_active' using errcode = '42501';
  end if;
  if p_recipe is null or jsonb_typeof(p_recipe) <> 'object' then
    raise exception 'invalid_recipe' using errcode = '22023';
  end if;
  begin
    v_id := (p_recipe->>'id')::uuid;
  exception when invalid_text_representation then
    v_id := null;
  end;
  if v_id is null or not private.is_uuid_v7(v_id) then
    raise exception 'invalid_recipe_id' using errcode = '22023';
  end if;
  v_patch := p_recipe - 'id';
  for v_key in select jsonb_object_keys(v_patch) loop
    if v_key <> all (c_writable) then
      raise exception 'recipe_field_not_writable: %', v_key using errcode = '22023';
    end if;
  end loop;
  if p_private is not null and (jsonb_typeof(p_private) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_private) k where k not in ('dictation', 'diners')
  )) then
    raise exception 'invalid_recipe_private' using errcode = '22023';
  end if;

  select * into v_old from public.recipes where id = v_id for update;
  if not found then
    insert into public.recipes (id, user_id, kitchen_id)
      values (v_id, v_uid, (select s.current_kitchen_id from public.user_settings s where s.user_id = v_uid))
      on conflict (id) do nothing
      returning * into v_old;
    if found then
      v_is_new := true;
    else
      -- 同時有另一個請求剛建立同一個 id
      select * into v_old from public.recipes where id = v_id for update;
    end if;
  end if;

  if not v_is_new then
    if v_old.user_id <> v_uid then
      raise exception 'recipe_not_found' using errcode = 'P0002';
    end if;
    if v_old.deleted_at is not null then
      raise exception 'recipe_deleted' using errcode = 'P0002';
    end if;
    if p_expected_updated_at is distinct from v_old.updated_at then
      raise exception 'recipe_conflict' using hint = '這篇在別的地方改過了，請看過最新版再改';
    end if;
  end if;

  select * into v_new from jsonb_populate_record(v_old, v_patch);

  -- 這些不能由手機決定
  v_new.id := v_old.id;
  v_new.user_id := v_old.user_id;
  v_new.created_at := v_old.created_at;
  v_new.deleted_at := v_old.deleted_at;
  v_new.created_via := v_old.created_via;
  v_new.schema_version := v_old.schema_version;
  v_new.status := v_old.status;
  v_new.published_at := v_old.published_at;
  v_new.safety_warnings := v_old.safety_warnings;
  v_new.version := v_old.version;
  v_new.ingredients := coalesce(v_new.ingredients, '[]');
  v_new.steps := coalesce(v_new.steps, '[]');
  v_new.cook_notes := coalesce(v_new.cook_notes, '[]');
  v_new.highlights := coalesce(v_new.highlights, '{}');
  v_new.tags := coalesce(v_new.tags, '{}');
  v_new.equipment_used_ids := coalesce(v_new.equipment_used_ids, '{}');

  -- 長度（只檢查這次送來的欄位）
  select text_limits into v_limits from public.app_config;
  if v_patch ? 'title' then
    perform private.check_text_limit('title', v_new.title, (v_limits->>'title')::int);
  end if;
  if v_patch ? 'story' then
    perform private.check_text_limit('story', v_new.story, (v_limits->>'story')::int);
  end if;
  if v_patch ? 'tips' then
    perform private.check_text_limit('tips', v_new.tips, (v_limits->>'tips')::int);
  end if;
  if v_patch ? 'steps' then
    for v_step in select s from jsonb_array_elements(v_new.steps) s loop
      perform private.check_text_limit('step', v_step->>'text', (v_limits->>'step')::int);
    end loop;
  end if;

  -- 廚房要是自己的廚房；改編的來源要是自己讀得到的食譜
  if v_new.kitchen_id is not null and v_new.kitchen_id is distinct from v_old.kitchen_id
     and not private.is_kitchen_member(v_new.kitchen_id) then
    raise exception 'kitchen_not_member' using errcode = '42501';
  end if;
  if v_new.parent_recipe_id is not null and v_new.parent_recipe_id is distinct from v_old.parent_recipe_id
     and not private.can_view_recipe(v_uid, v_new.parent_recipe_id) then
    raise exception 'parent_recipe_not_found' using errcode = 'P0002';
  end if;

  -- 衍生欄位
  if v_new.difficulty is not null then
    if private.difficulty_overall(v_new.difficulty) is null then
      raise exception 'invalid_difficulty' using errcode = '22023';
    end if;
    v_new.difficulty := jsonb_set(v_new.difficulty, '{overall}', to_jsonb(private.difficulty_overall(v_new.difficulty)));
  end if;
  v_new.ingredient_ids := private.recipe_ingredient_ids(v_new.ingredients, v_new.ai_tags);
  v_new.equipment_type_ids := private.recipe_step_equipment_ids(v_new.steps);
  v_new.techniques := private.recipe_step_techniques(v_new.steps);

  -- cooked_on：cooked_at 改變時，依食譜所在廚房的時區重算；廚房之後改時區不影響
  if v_new.cooked_at is distinct from v_old.cooked_at then
    if v_new.cooked_at is null then
      v_new.cooked_on := null;
    else
      select k.timezone into v_timezone from public.kitchens k where k.id = v_new.kitchen_id;
      v_new.cooked_on := (v_new.cooked_at at time zone coalesce(v_timezone, 'UTC'))::date;
    end if;
  end if;
  v_new.cooked_dates := coalesce((
    select array_agg(distinct d order by d)
    from (
      select v_new.cooked_on as d
      union all
      select (n->>'cooked_on')::date from jsonb_array_elements(v_new.cook_notes) n
    ) days
    where d is not null
  ), '{}');

  -- 做法改變時版本加一（新建的草稿從 1 開始）
  if not v_is_new and (v_new.ingredients, v_new.steps, v_new.tips, v_new.servings, v_new.difficulty)
     is distinct from (v_old.ingredients, v_old.steps, v_old.tips, v_old.servings, v_old.difficulty) then
    v_new.version := v_old.version + 1;
  end if;

  update public.recipes set
    lang = v_new.lang, title = v_new.title, story = v_new.story, highlights = v_new.highlights,
    rating = v_new.rating, cooked_at = v_new.cooked_at, cooked_on = v_new.cooked_on,
    kitchen_id = v_new.kitchen_id, cook_notes = v_new.cook_notes, cooked_dates = v_new.cooked_dates,
    servings = v_new.servings, difficulty = v_new.difficulty, ingredients = v_new.ingredients,
    steps = v_new.steps, tips = v_new.tips, cuisine_keys = v_new.cuisine_keys,
    dish_type_keys = v_new.dish_type_keys, tags = v_new.tags,
    equipment_type_ids = v_new.equipment_type_ids, techniques = v_new.techniques,
    ingredient_ids = v_new.ingredient_ids, equipment_used_ids = v_new.equipment_used_ids,
    ai_tags = v_new.ai_tags, source = v_new.source, parent_recipe_id = v_new.parent_recipe_id,
    version = v_new.version, visibility = v_new.visibility
  where id = v_id
  returning * into v_new;

  -- 已經不在步驟清單裡的步驟，照片資料列一起刪（檔案由維護工作清掉孤兒檔）
  if v_patch ? 'steps' then
    delete from public.photos p
      where p.owner_type = 'recipe_step' and p.recipe_id = v_id
        and p.owner_id::text <> all (array(select s->>'id' from jsonb_array_elements(v_new.steps) s));
  end if;

  if p_private is not null then
    insert into public.recipe_private (recipe_id, user_id, dictation, diners)
      values (
        v_id, v_uid,
        nullif(p_private->'dictation', 'null'::jsonb),
        coalesce(nullif(p_private->'diners', 'null'::jsonb), '[]')
      )
      on conflict (recipe_id) do update set
        dictation = case when p_private ? 'dictation' then excluded.dictation else public.recipe_private.dictation end,
        diners = case when p_private ? 'diners' then excluded.diners else public.recipe_private.diners end;
  end if;

  return v_new;
end;
$$;

-- 發佈：要有標題或至少一張照片。第一次發佈時填 published_at；已經發佈的重複呼叫沒有影響。
-- 「有新動態」的 Broadcast 在 M2 和 feed_page 一起做。
create function public.publish_recipe(p_id uuid)
returns public.recipes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.recipes;
begin
  if not private.is_active_user() then
    raise exception 'account_not_active' using errcode = '42501';
  end if;
  select * into v_row from public.recipes where id = p_id and user_id = (select auth.uid()) for update;
  if not found then
    raise exception 'recipe_not_found' using errcode = 'P0002';
  end if;
  if v_row.deleted_at is not null then
    raise exception 'recipe_deleted' using errcode = 'P0002';
  end if;
  if v_row.status = 'published' then
    return v_row;
  end if;
  if coalesce(btrim(v_row.title), '') = '' and not exists (
    select 1 from public.photos p
    where (p.owner_type = 'recipe' and p.owner_id = p_id)
       or (p.owner_type = 'recipe_step' and p.recipe_id = p_id)
  ) then
    raise exception 'recipe_empty' using errcode = '22023', hint = '要有標題或至少一張照片才能發佈';
  end if;
  update public.recipes
    set status = 'published', published_at = coalesce(published_at, now())
    where id = p_id
    returning * into v_row;
  return v_row;
end;
$$;

-- 刪除（軟刪除）：app_config.soft_delete_retention_days 天內可以復原。已經刪除的重複呼叫沒有影響。
create function public.delete_recipe(p_id uuid)
returns public.recipes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.recipes;
begin
  if not private.is_active_user() then
    raise exception 'account_not_active' using errcode = '42501';
  end if;
  select * into v_row from public.recipes where id = p_id and user_id = (select auth.uid()) for update;
  if not found then
    raise exception 'recipe_not_found' using errcode = 'P0002';
  end if;
  if v_row.deleted_at is not null then
    return v_row;
  end if;
  update public.recipes set deleted_at = now() where id = p_id returning * into v_row;
  return v_row;
end;
$$;

-- 復原：超過保留天數就不行（到期後由維護工作真正刪除）。沒刪除的重複呼叫沒有影響。
create function public.restore_recipe(p_id uuid)
returns public.recipes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.recipes;
  v_days integer;
begin
  if not private.is_active_user() then
    raise exception 'account_not_active' using errcode = '42501';
  end if;
  select * into v_row from public.recipes where id = p_id and user_id = (select auth.uid()) for update;
  if not found then
    raise exception 'recipe_not_found' using errcode = 'P0002';
  end if;
  if v_row.deleted_at is null then
    return v_row;
  end if;
  select soft_delete_retention_days into v_days from public.app_config;
  if v_row.deleted_at < now() - make_interval(days => v_days) then
    raise exception 'recipe_not_found' using errcode = 'P0002', hint = '已經超過保留期限';
  end if;
  update public.recipes set deleted_at = null where id = p_id returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.save_recipe(jsonb, timestamptz, jsonb) from public, anon;
revoke execute on function public.publish_recipe(uuid) from public, anon;
revoke execute on function public.delete_recipe(uuid) from public, anon;
revoke execute on function public.restore_recipe(uuid) from public, anon;
grant execute on function public.save_recipe(jsonb, timestamptz, jsonb) to authenticated;
grant execute on function public.publish_recipe(uuid) to authenticated;
grant execute on function public.delete_recipe(uuid) to authenticated;
grant execute on function public.restore_recipe(uuid) to authenticated;

-- 每日維護用：刪除超過保留天數的食譜（連同照片資料列、私人資料），回傳刪除幾筆。
-- 排程（pg_cron）在每日維護那一階段一起建，這裡只先備好函式。
create function private.purge_deleted_recipes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.recipes
    where deleted_at < now() - make_interval(days => (select soft_delete_retention_days from public.app_config));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

---------------------------------------------------------------------------
-- 照片：補上食譜與步驟照片（接續 20261120000007_photos.sql）
---------------------------------------------------------------------------

-- 食譜與步驟的照片只能掛在自己沒刪除的食譜上（步驟與又做了一次也要真的存在）；
-- 張數上限在這裡檢查，先鎖住那篇食譜，同時送出也不會超過
alter table public.photos
  add constraint photos_step_has_recipe check (owner_type <> 'recipe_step' or recipe_id is not null),
  add constraint photos_cover_only_recipe check (not is_cover or (owner_type = 'recipe' and cook_note_id is null));
-- 每篇食譜只有一張封面
create unique index photos_one_cover on public.photos (owner_id) where is_cover and owner_type = 'recipe';
create index photos_recipe on public.photos (recipe_id) where recipe_id is not null;

create or replace function private.photos_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_recipe_id uuid;
  v_recipe public.recipes;
  v_limits jsonb;
  v_count integer;
  v_limit integer;
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    return new;
  end if;

  new.created_by := (select auth.uid());

  if new.owner_type = 'equipment' then
    if not exists (
      select 1 from public.kitchen_equipment e where e.id = new.owner_id and e.kitchen_id = new.kitchen_id
    ) then
      raise exception 'photo_owner_not_found' using errcode = '23503',
        hint = '廚具不存在，或不在這個廚房';
    end if;
  elsif new.owner_type in ('recipe', 'recipe_step') then
    v_recipe_id := case when new.owner_type = 'recipe' then new.owner_id else new.recipe_id end;
    select * into v_recipe from public.recipes r
      where r.id = v_recipe_id and r.user_id = new.user_id and r.deleted_at is null
      for update;
    if not found then
      raise exception 'photo_owner_not_found' using errcode = '23503',
        hint = '食譜不存在，或已經刪除';
    end if;
    if new.owner_type = 'recipe_step' and not exists (
      select 1 from jsonb_array_elements(v_recipe.steps) s where s->>'id' = new.owner_id::text
    ) then
      raise exception 'photo_owner_not_found' using errcode = '23503', hint = '步驟不存在';
    end if;
    if new.cook_note_id is not null and not exists (
      select 1 from jsonb_array_elements(v_recipe.cook_notes) n where n->>'id' = new.cook_note_id::text
    ) then
      raise exception 'photo_owner_not_found' using errcode = '23503', hint = '又做了一次的記錄不存在';
    end if;

    select photo_limits into v_limits from public.app_config;
    if new.cook_note_id is not null then
      v_limit := (v_limits->>'per_cook_note')::int;
      select count(*) into v_count from public.photos p
        where p.owner_type = 'recipe' and p.owner_id = v_recipe_id and p.cook_note_id = new.cook_note_id;
    else
      v_limit := (v_limits->>'per_recipe')::int;
      select count(*) into v_count from public.photos p
        where (p.owner_type = 'recipe' and p.owner_id = v_recipe_id and p.cook_note_id is null)
           or (p.owner_type = 'recipe_step' and p.recipe_id = v_recipe_id);
    end if;
    if v_count >= v_limit then
      raise exception 'photo_limit_reached' using errcode = '54000',
        hint = format('最多 %s 張', v_limit);
    end if;
  end if;

  -- 上傳完成才建立資料列：三個檔案都要已經在 Storage 裡
  foreach v_path in array array[new.storage_path, new.feed_path, new.thumb_path] loop
    if not exists (select 1 from storage.objects o where o.bucket_id = 'photos' and o.name = v_path) then
      raise exception 'photo_file_missing: %', v_path using errcode = '23503';
    end if;
  end loop;
  return new;
end;
$$;

-- 讀：本人；食譜與步驟的照片另外開放給讀得到那篇食譜的人
create policy "讀得到食譜的人可以讀照片" on public.photos
  for select to authenticated
  using (
    (owner_type = 'recipe' and private.can_view_recipe((select auth.uid()), owner_id))
    or (owner_type = 'recipe_step' and private.can_view_recipe((select auth.uid()), recipe_id))
  );

grant insert (user_id, cook_note_id, recipe_id) on public.photos to authenticated;

create policy "作者可以新增食譜照片" on public.photos
  for insert to authenticated
  with check (
    owner_type in ('recipe', 'recipe_step') and user_id = (select auth.uid()) and private.is_active_user()
  );
create policy "作者可以改食譜照片" on public.photos
  for update to authenticated
  using (owner_type in ('recipe', 'recipe_step') and user_id = (select auth.uid()))
  with check (
    owner_type in ('recipe', 'recipe_step') and user_id = (select auth.uid()) and private.is_active_user()
  );
create policy "作者可以刪食譜照片" on public.photos
  for delete to authenticated
  using (
    owner_type in ('recipe', 'recipe_step') and user_id = (select auth.uid()) and private.is_active_user()
  );

-- Storage：users/{userId}/ 底下的食譜與步驟照片，讀取另外開放給讀得到那篇食譜的人
-- （用檔名裡的照片 ID 找到資料列，再判斷食譜）；寫入仍然只有本人
create or replace function private.can_access_photo_path(p_name text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope text := split_part(p_name, '/', 1);
  v_id text := split_part(p_name, '/', 2);
  v_file text := split_part(p_name, '/', 3);
begin
  if v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_file !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_feed|_thumb)?\.webp$'
     or split_part(p_name, '/', 4) <> '' then
    return false;
  end if;
  if p_write and not private.is_active_user() then
    return false;
  end if;
  if v_scope = 'users' then
    if v_id::uuid = (select auth.uid()) then
      return true;
    end if;
    if p_write then
      return false;
    end if;
    return exists (
      select 1 from public.photos p
      where p.id = substr(v_file, 1, 36)::uuid
        and p.user_id = v_id::uuid
        and (
          (p.owner_type = 'recipe' and private.can_view_recipe((select auth.uid()), p.owner_id))
          or (p.owner_type = 'recipe_step' and private.can_view_recipe((select auth.uid()), p.recipe_id))
        )
    );
  elsif v_scope = 'kitchens' then
    return private.is_kitchen_member(v_id::uuid);
  end if;
  return false;
end;
$$;
