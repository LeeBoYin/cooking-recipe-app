-- 口味檔案改成多來源計算、點子回饋（M1a-10a；03〈口味檔案〉、05 TasteProfileSnapshot／AiSuggestionCache.feedback、13 第六節、16 第三、七節）。
-- taste_profile_snapshots：每人一列的口味檔案快照。口味地圖、收藏、點子回饋、手邊食材、對話裡的偏好一改，由觸發器標成過期；
--   ai 函式要用時發現過期或沒有這一列，就用 core 重算再經 taste_profile_save 存回去。手機不能寫。
--   自己記錄的食譜要等「發佈後整理」寫好標籤才算進口味（M1b），這一段不接 recipes。
-- ai_suggestion_cache.feedback：收藏（bookmarked）、做了並記錄（recorded）的回饋，格式 { ideaId, action, reason?, at }。
-- bookmarks.idea.origin：點子在快取裡的出處 { suggestionId, ideaId }，之後記回饋用；cooked_recipe_id 改經 record_bookmark_cooked 設定。
-- ai_home_context 多回傳口味快照；過期或不存在時再附上重算要用的原始資料。

---------------------------------------------------------------------------
-- taste_profile_snapshots
---------------------------------------------------------------------------
create table public.taste_profile_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  computed_at timestamptz not null default now(),
  stale boolean not null default false,
  period text not null default 'all_time' check (period in ('all_time')),
  -- 綜合口味探索、收藏、回饋、對話與手邊食材算出來的口味；格式和 core 的 TasteProfile 一致（加 schemaVersion 與來源計數）
  data jsonb not null check (extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["schemaVersion", "dims", "context", "sources"],
      "properties": {
        "schemaVersion": { "const": 1 },
        "dims": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "required": ["affinity", "confidence", "source", "updatedAt"],
            "properties": {
              "affinity": { "type": "number", "minimum": -1, "maximum": 1 },
              "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
              "source": { "enum": ["user_set", "explored", "learned"] },
              "updatedAt": { "type": "string" }
            },
            "additionalProperties": false
          }
        },
        "context": {
          "type": "object",
          "required": ["adventure", "goals", "festiveDishes"],
          "properties": {
            "timePreference": { "enum": ["quick", "normal", "relaxed"] },
            "cooksFor": { "type": "array", "items": { "enum": ["self", "partner", "family", "guests"] } },
            "adventure": { "type": "number", "minimum": 0, "maximum": 1 },
            "goals": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 20 },
            "festiveDishes": { "type": "boolean" }
          },
          "additionalProperties": false
        },
        "sources": {
          "type": "object",
          "required": ["quiz", "saved", "cooked", "signals", "pantry"],
          "properties": {
            "quiz": { "type": "boolean" },
            "saved": { "type": "integer", "minimum": 0 },
            "cooked": { "type": "integer", "minimum": 0 },
            "signals": { "type": "integer", "minimum": 0 },
            "pantry": { "type": "integer", "minimum": 0 }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    }'::json, data)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_timestamps before update on public.taste_profile_snapshots
  for each row execute function private.set_timestamps();

alter table public.taste_profile_snapshots enable row level security;
revoke all on public.taste_profile_snapshots from anon, authenticated, service_role;
grant select on public.taste_profile_snapshots to authenticated, service_role;

create policy "本人讀自己的口味檔案" on public.taste_profile_snapshots
  for select to authenticated using (user_id = (select auth.uid()));

-- taste_profile_save：存重算好的口味檔案。p_read_at 是讀原始資料的時間（ai_home_context 的 read_at）：
-- 讀完之後又有資料變動（觸發器在那之後把這一列標成過期），這一列維持過期，下次再算。
create function public.taste_profile_save(p_user uuid, p_data jsonb, p_read_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.taste_profile_snapshots (user_id, data, computed_at, stale)
  values (p_user, p_data, now(), false)
  on conflict (user_id) do update
    set data = excluded.data,
        computed_at = now(),
        stale = coalesce(public.taste_profile_snapshots.updated_at > p_read_at, false);
end;
$$;

---------------------------------------------------------------------------
-- 觸發器：資料變動時把相關使用者的口味檔案標成過期（沒有這一列就什麼都不做；沒有列當作過期）
---------------------------------------------------------------------------
create function private.taste_mark_stale(p_users uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.taste_profile_snapshots set stale = true
  where user_id = any (p_users) and not stale;
$$;

create function private.taste_stale_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.taste_mark_stale(array[case when tg_op = 'DELETE' then old.user_id else new.user_id end]);
  return null;
end;
$$;

-- 食材與醬料櫃：同廚房的成員都要標
create function private.taste_stale_kitchen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.taste_mark_stale(coalesce((
    select array_agg(m.user_id) from public.kitchen_members m
    where m.left_at is null
      and m.kitchen_id in (case when tg_op = 'INSERT' then null else old.kitchen_id end, case when tg_op = 'DELETE' then null else new.kitchen_id end)
  ), '{}'));
  return null;
end;
$$;

create trigger taste_stale_ins_del after insert or delete on public.preference_profiles
  for each row execute function private.taste_stale_user();
create trigger taste_stale_upd after update on public.preference_profiles
  for each row when (old.dims is distinct from new.dims or old.context is distinct from new.context)
  execute function private.taste_stale_user();

create trigger taste_stale_ins_del after insert or delete on public.bookmarks
  for each row execute function private.taste_stale_user();
create trigger taste_stale_upd after update on public.bookmarks
  for each row when (old.deleted_at is distinct from new.deleted_at or old.cooked_recipe_id is distinct from new.cooked_recipe_id)
  execute function private.taste_stale_user();

create trigger taste_stale_upd after update on public.ai_suggestion_cache
  for each row when (old.feedback is distinct from new.feedback)
  execute function private.taste_stale_user();

create trigger taste_stale_ins after insert on public.chef_conversations
  for each row when (new.preference_signals <> '[]'::jsonb)
  execute function private.taste_stale_user();
create trigger taste_stale_upd after update on public.chef_conversations
  for each row when (old.preference_signals is distinct from new.preference_signals)
  execute function private.taste_stale_user();
create trigger taste_stale_del after delete on public.chef_conversations
  for each row when (old.preference_signals <> '[]'::jsonb)
  execute function private.taste_stale_user();

create trigger taste_stale_ins_del after insert or delete on public.pantry_items
  for each row execute function private.taste_stale_kitchen();
create trigger taste_stale_upd after update on public.pantry_items
  for each row when (old.status is distinct from new.status or old.ingredient_id is distinct from new.ingredient_id or old.kitchen_id is distinct from new.kitchen_id)
  execute function private.taste_stale_kitchen();

---------------------------------------------------------------------------
-- 點子回饋：寫進 ai_suggestion_cache.feedback
---------------------------------------------------------------------------
alter table public.ai_suggestion_cache drop constraint ai_suggestion_cache_feedback_check;
alter table public.ai_suggestion_cache add constraint ai_suggestion_cache_feedback_check check (extensions.jsonb_matches_schema(
  '{
    "type": "array",
    "maxItems": 40,
    "items": {
      "type": "object",
      "required": ["ideaId", "action", "at"],
      "properties": {
        "ideaId": { "type": "string", "maxLength": 80 },
        "action": { "enum": ["bookmarked", "recorded", "dismissed"] },
        "reason": { "type": "string", "maxLength": 40 },
        "at": { "type": "string" }
      },
      "additionalProperties": false
    }
  }'::json, feedback));

-- 同一個點子的同一種回饋只記一次；快取已經不在（過期被刪）、點子不在那一組裡，就什麼都不做
create function private.add_idea_feedback(p_user uuid, p_suggestion uuid, p_idea_id text, p_action text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_suggestion_cache s
  set feedback = s.feedback || jsonb_build_array(jsonb_build_object('ideaId', p_idea_id, 'action', p_action, 'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
  where s.id = p_suggestion and s.user_id = p_user
    and s.payload -> 'ideas' @> jsonb_build_array(jsonb_build_object('id', p_idea_id))
    and not s.feedback @> jsonb_build_array(jsonb_build_object('ideaId', p_idea_id, 'action', p_action));
$$;

-- 收藏的點子帶出處（點子在哪一組快取的哪一個），之後記「做了」要用
alter table public.bookmarks drop constraint bookmarks_idea_check;
alter table public.bookmarks add constraint bookmarks_idea_check check (extensions.jsonb_matches_schema(
  '{
    "type": "object",
    "required": ["schemaVersion", "title"],
    "properties": {
      "schemaVersion": { "const": 1 },
      "title": { "type": "string", "minLength": 1, "maxLength": 40 },
      "why": { "type": "string", "maxLength": 120 },
      "baseDishId": { "type": "string", "maxLength": 80 },
      "suggestionId": { "type": "string", "maxLength": 80 },
      "origin": {
        "type": "object",
        "required": ["suggestionId", "ideaId"],
        "properties": { "suggestionId": { "type": "string", "maxLength": 80 }, "ideaId": { "type": "string", "maxLength": 80 } },
        "additionalProperties": false
      },
      "recipeDraft": { "type": "object" }
    },
    "additionalProperties": false
  }'::json, idea) and (idea ? 'baseDishId' or idea ? 'suggestionId'));

---------------------------------------------------------------------------
-- bookmark_recipe、bookmark_ai_idea：記下點子的出處，並記一筆「收藏」的回饋
---------------------------------------------------------------------------
create or replace function public.bookmark_recipe(p_id uuid, p_title text, p_why text, p_base_dish_id text, p_suggestion_id uuid default null, p_idea_id text default null)
returns public.bookmarks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_dish public.dict_base_dishes;
  v_main text[];
  v_row public.bookmarks;
  v_draft jsonb;
  v_origin jsonb;
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_id is null or not private.is_uuid_v7(p_id) then
    raise exception 'invalid_id' using errcode = '22023';
  end if;

  select * into v_dish from public.dict_base_dishes where id = p_base_dish_id;
  if not found then
    raise exception 'base_dish_not_found' using errcode = '23503', hint = '找不到這道家常菜';
  end if;

  -- 這個點子在首頁或對話已經展開過做法就一起存進收藏（由快取讀，不信任手機送來的內容）
  if p_suggestion_id is not null and p_idea_id is not null then
    select s.drafts -> p_idea_id into v_draft
    from public.ai_suggestion_cache s where s.id = p_suggestion_id and s.user_id = v_user;
    -- 點子真的在那一組裡才記下出處（之後的回饋要用）；不信任手機送來的 ID
    if exists (
      select 1 from public.ai_suggestion_cache s
      where s.id = p_suggestion_id and s.user_id = v_user and s.payload -> 'ideas' @> jsonb_build_array(jsonb_build_object('id', p_idea_id))
    ) then
      v_origin := jsonb_build_object('suggestionId', p_suggestion_id::text, 'ideaId', p_idea_id);
    end if;
  end if;

  select * into v_row from public.bookmarks
  where user_id = v_user and kind = 'chef_idea' and deleted_at is null and idea ->> 'baseDishId' = p_base_dish_id;
  if found then
    return v_row;
  end if;

  select coalesce(array_agg(t.id order by t.ord), '{}') into v_main
  from (
    select u.id, min(u.ord) as ord
    from unnest(v_dish.ingredient_ids) with ordinality as u(id, ord)
    left join public.dict_ingredients i on i.id = u.id
    where i.category is null or i.category not in ('seasoning', 'sauce', 'spice', 'oil')
    group by u.id
  ) t;

  insert into public.bookmarks (id, user_id, kind, idea, idea_ingredient_ids)
  values (
    p_id, v_user, 'chef_idea',
    jsonb_strip_nulls(jsonb_build_object(
      'schemaVersion', 1,
      'title', btrim(p_title),
      'why', nullif(btrim(coalesce(p_why, '')), ''),
      'baseDishId', p_base_dish_id,
      'recipeDraft', v_draft,
      'origin', v_origin
    )),
    v_main
  )
  on conflict (id) do nothing
  returning * into v_row;

  -- id 已經被別筆用掉（別人的、或自己已取消的）：不回傳別人的資料
  if v_row.id is null then
    raise exception 'id_in_use' using errcode = '23505';
  end if;
  if v_origin is not null then
    perform private.add_idea_feedback(v_user, p_suggestion_id, p_idea_id, 'bookmarked');
  end if;
  return v_row;
end;
$$;

create or replace function public.bookmark_ai_idea(p_id uuid, p_suggestion_id uuid, p_title text)
returns public.bookmarks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_idea jsonb;
  v_ids text[];
  v_main text[];
  v_row public.bookmarks;
  v_draft jsonb;
  v_title text := btrim(coalesce(p_title, ''));
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_id is null or not private.is_uuid_v7(p_id) then
    raise exception 'invalid_id' using errcode = '22023';
  end if;

  select i into v_idea
  from public.ai_suggestion_cache s, jsonb_array_elements(s.payload -> 'ideas') i
  where s.id = p_suggestion_id and s.user_id = v_user and i ->> 'title' = v_title
  limit 1;
  if v_idea is null then
    raise exception 'idea_not_found' using errcode = '23503', hint = '找不到這個點子';
  end if;

  -- 已經展開過做法就一起存進收藏
  select s.drafts -> (v_idea ->> 'id') into v_draft
  from public.ai_suggestion_cache s where s.id = p_suggestion_id and s.user_id = v_user;

  select * into v_row from public.bookmarks
  where user_id = v_user and kind = 'chef_idea' and deleted_at is null
    and idea ->> 'suggestionId' = p_suggestion_id::text and idea ->> 'title' = v_title;
  if found then
    return v_row;
  end if;

  select coalesce(array_agg(x), '{}') into v_ids from (
    select jsonb_array_elements_text(coalesce(v_idea -> 'usesPantryIds', '[]'))
    union
    select jsonb_array_elements_text(coalesce(v_idea -> 'usesMentionedIds', '[]'))
    union
    select o ->> 'ingredientId' from jsonb_array_elements(coalesce(v_idea -> 'otherIngredients', '[]')) o where o ->> 'ingredientId' is not null
  ) t(x);
  select coalesce(array_agg(i.id order by i.id), '{}') into v_main
  from public.dict_ingredients i
  where i.id = any (v_ids) and i.category not in ('seasoning', 'sauce', 'spice', 'oil');

  insert into public.bookmarks (id, user_id, kind, idea, idea_ingredient_ids)
  values (
    p_id, v_user, 'chef_idea',
    jsonb_strip_nulls(jsonb_build_object(
      'schemaVersion', 1,
      'title', v_title,
      'why', nullif(left(btrim(coalesce(v_idea ->> 'why', '')), 120), ''),
      'suggestionId', p_suggestion_id::text,
      'recipeDraft', v_draft,
      'origin', jsonb_build_object('suggestionId', p_suggestion_id::text, 'ideaId', v_idea ->> 'id')
    )),
    v_main
  )
  on conflict (id) do nothing
  returning * into v_row;

  if v_row.id is null then
    raise exception 'id_in_use' using errcode = '23505';
  end if;
  perform private.add_idea_feedback(v_user, p_suggestion_id, v_idea ->> 'id', 'bookmarked');
  return v_row;
end;
$$;

---------------------------------------------------------------------------
-- ai_home_context：多回傳口味快照與（過期時）重算用的原始資料
---------------------------------------------------------------------------
create or replace function public.ai_home_context(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.user_settings;
  v_kitchen public.kitchens;
  v_snapshot public.taste_profile_snapshots;
  v_need boolean;
begin
  select * into v_settings from public.user_settings where user_id = p_user;
  if not found then
    return null;
  end if;

  -- 現在的廚房；設定裡的廚房不在了就取最早加入的（和手機一致）
  select k.* into v_kitchen
  from public.kitchen_members m
  join public.kitchens k on k.id = m.kitchen_id
  where m.user_id = p_user and m.left_at is null and k.deleted_at is null
  order by (k.id = v_settings.current_kitchen_id) desc, m.joined_at
  limit 1;
  if not found then
    return null;
  end if;

  -- 口味檔案的快照：不存在或過期就一併回傳重算要用的原始資料（ai 函式用 core 重算再存回去）
  select * into v_snapshot from public.taste_profile_snapshots where user_id = p_user;
  v_need := v_snapshot.user_id is null or v_snapshot.stale;

  return jsonb_build_object(
    'read_at', now(),
    'kitchen', jsonb_build_object('id', v_kitchen.id, 'region', v_kitchen.region, 'timezone', v_kitchen.timezone),
    'settings', jsonb_build_object('locale', v_settings.locale, 'chef_persona', v_settings.chef_persona),
    'taste', (
      select jsonb_build_object('dims', pp.dims, 'context', pp.context)
      from public.preference_profiles pp where pp.user_id = p_user
    ),
    'taste_snapshot', case when v_snapshot.user_id is null then null
      else jsonb_build_object('stale', v_snapshot.stale, 'data', v_snapshot.data) end,
    'taste_inputs', case when not v_need then null else jsonb_build_object(
      -- 收藏的點子（還在收藏裡的）；cooked：已經從這個收藏記錄了自己的版本
      'saved', coalesce((
        select jsonb_agg(jsonb_build_object(
          'base_dish_id', b.idea ->> 'baseDishId',
          'ingredient_ids', b.idea_ingredient_ids,
          'cooked', b.cooked_recipe_id is not null,
          'at', b.created_at) order by b.created_at desc)
        from (
          select * from public.bookmarks
          where user_id = p_user and kind = 'chef_idea' and deleted_at is null
          order by created_at desc limit 200
        ) b
      ), '[]'),
      -- 對話裡說的偏好（每段對話最後一則訊息的時間當作發生的時間）
      'signals', coalesce((
        select jsonb_agg(jsonb_build_object('at', c.last_message_at, 'signals', c.preference_signals) order by c.last_message_at desc)
        from (
          select * from public.chef_conversations
          where user_id = p_user and preference_signals <> '[]'::jsonb
          order by last_message_at desc limit 50
        ) c
      ), '[]')
    ) end,
    'dietary', (
      select jsonb_build_object(
        'allergen_ids', d.allergen_ids,
        'restriction_ids', d.dietary_restriction_ids,
        'dislike_ingredient_ids', d.dislike_ingredient_ids,
        'no_cooking_alcohol', d.no_cooking_alcohol)
      from public.dietary_profiles d where d.user_id = p_user
    ),
    'pantry', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ingredient_id', i.ingredient_id,
        'want_to_use_soon', i.want_to_use_soon,
        'expires_at', i.expires_at))
      from public.pantry_items i
      where i.kitchen_id = v_kitchen.id and i.status = 'active' and i.ingredient_id is not null
    ), '[]'),
    'equipment', coalesce((
      select jsonb_agg(jsonb_build_object(
        'equipment_type_id', e.equipment_type_id,
        'enabled_optional_techniques', e.enabled_optional_techniques))
      from public.kitchen_equipment e where e.kitchen_id = v_kitchen.id
    ), '[]'),
    -- 只取最近的 200 篇已發佈食譜；自己的食譜才算
    'recipes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'ingredient_ids', r.ingredient_ids,
        'ingredients', r.ingredients,
        'highlights', r.highlights,
        'cooked_dates', r.cooked_dates,
        'cooked_at', r.cooked_at,
        'published_at', r.published_at,
        'difficulty', r.difficulty))
      from (
        select * from public.recipes
        where user_id = p_user and status = 'published' and deleted_at is null
        order by published_at desc
        limit 200
      ) r
    ), '[]'),
    -- 最近的首頁點子（同一個 6 小時內的幾輪，最新的在前）
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'input_hash', c.input_hash,
        'round', c.round,
        'created_at', c.created_at,
        'expires_at', c.expires_at,
        'payload', c.payload) order by c.created_at desc)
      from (
        select * from public.ai_suggestion_cache
        where user_id = p_user and kind = 'home' and created_at > now() - interval '12 hours'
        order by created_at desc
        limit 4
      ) c
    ), '[]')
  );
end;
$$;

---------------------------------------------------------------------------
-- record_bookmark_cooked：從收藏記錄了自己的版本後，連到那一篇，並記一筆「做了」的回饋（同一個動作）。
-- 取代手機直接改 cooked_recipe_id。快取已經不在時只連食譜；口味的計算靠收藏本身，不靠快取。
---------------------------------------------------------------------------
create function public.record_bookmark_cooked(p_bookmark uuid, p_recipe uuid)
returns public.bookmarks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_row public.bookmarks;
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_row from public.bookmarks
  where id = p_bookmark and user_id = v_user and kind = 'chef_idea' and deleted_at is null
  for update;
  if not found then
    raise exception 'bookmark_not_found' using errcode = '23503', hint = '找不到這個收藏';
  end if;
  -- 只能連到自己還在的食譜（觸發器檢查）
  update public.bookmarks set cooked_recipe_id = p_recipe where id = p_bookmark returning * into v_row;
  if v_row.idea -> 'origin' is not null then
    perform private.add_idea_feedback(v_user, (v_row.idea -> 'origin' ->> 'suggestionId')::uuid, v_row.idea -> 'origin' ->> 'ideaId', 'recorded');
  end if;
  return v_row;
end;
$$;

revoke update (cooked_recipe_id) on public.bookmarks from authenticated;

revoke execute on function public.record_bookmark_cooked(uuid, uuid) from public, anon;
grant execute on function public.record_bookmark_cooked(uuid, uuid) to authenticated;
revoke execute on function public.taste_profile_save(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.taste_profile_save(uuid, jsonb, timestamptz) to service_role;
revoke execute on function public.ai_home_context(uuid) from public, anon, authenticated;
grant execute on function public.ai_home_context(uuid) to service_role;
