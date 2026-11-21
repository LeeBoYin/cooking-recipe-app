-- 點子抽屜直接顯示做法（M1a-09；03〈展開做法〉、05 AiSuggestionCache.drafts／Bookmark.idea.recipeDraft）。
-- ai_expand_get：expand_steps 任務讀點子本身（不信任手機送來的內容）與已經展開的做法；ai_expand_save：把展開好的做法存進
--   快取列的 drafts，點子已經收藏就同時存進 bookmarks.idea.recipeDraft。兩個都只給 service_role。
-- bookmarks：idea 可以帶 recipeDraft；收藏時快取裡已經有做法就一起存（bookmark_ai_idea、bookmark_recipe）。

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
      "recipeDraft": { "type": "object" }
    },
    "additionalProperties": false
  }'::json, idea) and (idea ? 'baseDishId' or idea ? 'suggestionId'));

create or replace function private.bookmarks_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.user_id := old.user_id;
    new.kind := old.kind;
    -- 點子的快照不能改；只有展開好的做法（recipeDraft）可以由 ai_expand_save、bookmark 函式補上
    if (new.idea - 'recipeDraft') is distinct from (old.idea - 'recipeDraft') then
      new.idea := old.idea;
    end if;
    new.idea_ingredient_ids := old.idea_ingredient_ids;
  end if;
  new.updated_at := now();
  -- 只能連到自己的、還在的食譜
  if new.cooked_recipe_id is not null
     and (tg_op = 'INSERT' or new.cooked_recipe_id is distinct from old.cooked_recipe_id) then
    if not exists (
      select 1 from public.recipes r
      where r.id = new.cooked_recipe_id and r.user_id = new.user_id and r.deleted_at is null
    ) then
      raise exception 'cooked_recipe_not_found' using errcode = '23503',
        hint = '只能連到自己的食譜';
    end if;
  end if;
  return new;
end;
$$;



---------------------------------------------------------------------------
-- bookmark_recipe（家常菜）多兩個選填參數：點子在快取裡已經展開過做法就一起存進收藏
---------------------------------------------------------------------------
drop function public.bookmark_recipe(uuid, text, text, text);

create function public.bookmark_recipe(p_id uuid, p_title text, p_why text, p_base_dish_id text, p_suggestion_id uuid default null, p_idea_id text default null)
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
      'recipeDraft', v_draft
    )),
    v_main
  )
  on conflict (id) do nothing
  returning * into v_row;

  -- id 已經被別筆用掉（別人的、或自己已取消的）：不回傳別人的資料
  if v_row.id is null then
    raise exception 'id_in_use' using errcode = '23505';
  end if;
  return v_row;
end;
$$;


---------------------------------------------------------------------------
-- bookmark_ai_idea：已經展開過做法就一起存進收藏
---------------------------------------------------------------------------
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
      'recipeDraft', v_draft
    )),
    v_main
  )
  on conflict (id) do nothing
  returning * into v_row;

  if v_row.id is null then
    raise exception 'id_in_use' using errcode = '23505';
  end if;
  return v_row;
end;
$$;


---------------------------------------------------------------------------
-- ai_expand_get：回傳點子本身、已經展開的做法（快取列優先，沒有就用收藏裡的）、對應的收藏、平常煮幾人份
-- 兩種進來的方式：快取列 id＋點子 id（首頁或對話），或收藏 id（點子的細節從收藏快照與快取讀；快取已經清掉就只剩快照）
-- 不是本人的、不存在的都回空
---------------------------------------------------------------------------
create function public.ai_expand_get(p_user uuid, p_suggestion uuid, p_idea text, p_bookmark uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_size smallint;
  v_b public.bookmarks;
  v_cache public.ai_suggestion_cache;
  v_cached boolean := false;
  v_idea jsonb;
  v_idea_id text;
  v_draft jsonb;
  v_bm uuid;
  v_snap jsonb;
  v_ids text[] := '{}';
begin
  select household_size into v_size from public.user_settings where user_id = p_user;
  if not found then
    return null;
  end if;

  if p_bookmark is not null then
    select * into v_b from public.bookmarks
    where id = p_bookmark and user_id = p_user and kind = 'chef_idea' and deleted_at is null;
    if not found then
      return null;
    end if;
    v_snap := v_b.idea;
    v_ids := v_b.idea_ingredient_ids;
    v_bm := v_b.id;
    v_draft := v_b.idea -> 'recipeDraft';
    if v_b.idea ? 'suggestionId' then
      select * into v_cache from public.ai_suggestion_cache
      where id = (v_b.idea ->> 'suggestionId')::uuid and user_id = p_user;
      v_cached := found;
      if v_cached then
        select i into v_idea from jsonb_array_elements(v_cache.payload -> 'ideas') i
        where i ->> 'title' = v_b.idea ->> 'title' limit 1;
      end if;
    end if;
  else
    select * into v_cache from public.ai_suggestion_cache where id = p_suggestion and user_id = p_user;
    if not found then
      return null;
    end if;
    v_cached := true;
    select i into v_idea from jsonb_array_elements(v_cache.payload -> 'ideas') i where i ->> 'id' = p_idea;
    if v_idea is null then
      return null;
    end if;
    select * into v_b from public.bookmarks b
    where b.user_id = p_user and b.kind = 'chef_idea' and b.deleted_at is null
      and ((b.idea ->> 'suggestionId' = p_suggestion::text and b.idea ->> 'title' = v_idea ->> 'title')
        or (v_idea ->> 'candidateRef' like 'dish:%' and b.idea ->> 'baseDishId' = substr(v_idea ->> 'candidateRef', 6)))
    limit 1;
    if found then
      v_bm := v_b.id;
      v_snap := v_b.idea;
      v_draft := v_b.idea -> 'recipeDraft';
    end if;
  end if;

  v_idea_id := v_idea ->> 'id';
  if v_cached and v_idea_id is not null then
    v_draft := coalesce(v_cache.drafts -> v_idea_id, v_draft);
  end if;

  return jsonb_build_object(
    'household_size', v_size,
    'idea', v_idea,
    'snapshot', v_snap,
    'ingredient_ids', to_jsonb(v_ids),
    'draft', v_draft,
    'cache_id', case when v_cached then v_cache.id end,
    'idea_id', v_idea_id,
    'bookmark_id', v_bm
  );
end;
$$;

---------------------------------------------------------------------------
-- ai_expand_save：存展開好的做法。快取列的 drafts 依點子 id 存；點子已經收藏就同時存進收藏
---------------------------------------------------------------------------
create function public.ai_expand_save(p_user uuid, p_cache uuid, p_idea_id text, p_bookmark uuid, p_draft jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    raise exception 'invalid_draft' using errcode = '22023';
  end if;
  if p_cache is not null and p_idea_id is not null then
    update public.ai_suggestion_cache
    set drafts = drafts || jsonb_build_object(p_idea_id, p_draft)
    where id = p_cache and user_id = p_user;
  end if;
  if p_bookmark is not null then
    update public.bookmarks
    set idea = idea || jsonb_build_object('recipeDraft', p_draft)
    where id = p_bookmark and user_id = p_user and kind = 'chef_idea' and deleted_at is null;
  end if;
end;
$$;

revoke execute on function public.bookmark_recipe(uuid, text, text, text, uuid, text) from public, anon;
grant execute on function public.bookmark_recipe(uuid, text, text, text, uuid, text) to authenticated;
revoke execute on function public.ai_expand_get(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.ai_expand_save(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ai_expand_get(uuid, uuid, text, uuid) to service_role;
grant execute on function public.ai_expand_save(uuid, uuid, text, uuid, jsonb) to service_role;
