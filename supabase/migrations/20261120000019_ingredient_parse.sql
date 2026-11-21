-- 食材存檔時解析（M0-21b）：每一列食材的 ingredient_id、amount、amount_max、unit 由手機用 core 的解析器從原文算出後送來
-- （中文原文不適合在資料庫裡解析），資料庫只檢查，不合格的欄位清空、保留原文：
--   ingredient_id 要在字典裡；unit 要在 UnitCode 清單裡；amount 要是正數；amount_max 要是正數且不小於 amount（沒有 amount 就不能有）。
-- 欄位在 05 的 RecipeIngredient 本來就有，沒有改結構，和前一版 App 相容（舊版不送這些欄位）。

create function private.is_unit_code(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value = any (array[
    'g', 'kg', 'oz', 'lb', 'tw_jin', 'tw_liang', 'cn_jin',
    'ml', 'l', 'tsp', 'tbsp', 'cup', 'cup_jp', 'rice_cup', 'fl_oz', 'qt',
    'cm', 'inch',
    'piece', 'whole', 'pack', 'clove', 'slice', 'stalk', 'bunch', 'block', 'box', 'can', 'serving', 'pinch', 'to_taste'
  ]);
$$;

-- 清掉不合格的解析欄位。不是物件的項目原樣放行（交給資料表的格式檢查拒絕）
create function private.clean_recipe_ingredients(p_ingredients jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
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
  ), '[]'::jsonb)
  from jsonb_array_elements(p_ingredients) with ordinality as x(item, ord);
$$;

create or replace function public.save_recipe(
  p_recipe jsonb,
  p_expected_updated_at timestamptz default null,
  p_private jsonb default null,
  p_photos jsonb default null
)
returns public.recipes
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_writable constant text[] := array[
    'lang', 'title', 'story', 'highlights', 'cooked_at', 'kitchen_id', 'cook_notes', 'servings',
    'difficulty', 'ingredients', 'steps', 'tips', 'equipment_used_ids',
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
  v_max_steps integer;
  v_photo jsonb;
  v_ord bigint;
  v_photo_id uuid;
  v_type text;
  v_owner uuid;
  v_existing public.photos;
  v_first_top uuid;
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
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

  if p_photos is not null then
    if jsonb_typeof(p_photos) <> 'array' then
      raise exception 'invalid_photos' using errcode = '22023';
    end if;
    for v_photo in select x from jsonb_array_elements(p_photos) x loop
      if jsonb_typeof(v_photo) <> 'object'
         or exists (
           select 1 from jsonb_object_keys(v_photo) k
           where k not in ('id', 'owner_type', 'owner_id', 'width', 'height', 'taken_at')
         )
         or coalesce(v_photo->>'id', '') !~ c_uuid
         or coalesce(v_photo->>'owner_type', '') not in ('recipe', 'recipe_step')
         or (v_photo->>'owner_type' = 'recipe_step' and coalesce(v_photo->>'owner_id', '') !~ c_uuid)
         or jsonb_typeof(v_photo->'width') is distinct from 'number'
         or jsonb_typeof(v_photo->'height') is distinct from 'number' then
        raise exception 'invalid_photos' using errcode = '22023';
      end if;
    end loop;
    if (select count(distinct x->>'id') from jsonb_array_elements(p_photos) x) <> jsonb_array_length(p_photos) then
      raise exception 'invalid_photos' using errcode = '22023', hint = '照片重複了';
    end if;
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
  if v_patch ? 'ingredients' then
    v_new.ingredients := private.clean_recipe_ingredients(v_new.ingredients);
  end if;
  v_new.steps := coalesce(v_new.steps, '[]');
  v_new.cook_notes := coalesce(v_new.cook_notes, '[]');
  v_new.highlights := coalesce(v_new.highlights, '{}');
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
    select max_steps into v_max_steps from public.app_config;
    if jsonb_array_length(v_new.steps) > v_max_steps then
      raise exception 'too_many_steps' using errcode = '54000', hint = format('最多 %s 步', v_max_steps);
    end if;
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
    cooked_at = v_new.cooked_at, cooked_on = v_new.cooked_on,
    kitchen_id = v_new.kitchen_id, cook_notes = v_new.cook_notes, cooked_dates = v_new.cooked_dates,
    servings = v_new.servings, difficulty = v_new.difficulty, ingredients = v_new.ingredients,
    steps = v_new.steps, tips = v_new.tips,
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

  -- 照片：p_photos 是上方照片與步驟照片的完整清單（又做了一次的照片不動）。
  -- 不在清單裡的刪掉，新的建立（三個檔案要已經在 Storage），順序依清單，上方照片的第一張是封面。
  if p_photos is not null then
    delete from public.photos p
      where p.user_id = v_uid
        and (
          (p.owner_type = 'recipe' and p.owner_id = v_id and p.cook_note_id is null)
          or (p.owner_type = 'recipe_step' and p.recipe_id = v_id)
        )
        and p.id <> all (array(select (x->>'id')::uuid from jsonb_array_elements(p_photos) x));
    update public.photos set is_cover = false
      where owner_type = 'recipe' and owner_id = v_id and is_cover;

    for v_photo, v_ord in select x, o from jsonb_array_elements(p_photos) with ordinality as t(x, o) loop
      v_photo_id := (v_photo->>'id')::uuid;
      v_type := v_photo->>'owner_type';
      v_owner := case when v_type = 'recipe' then v_id else (v_photo->>'owner_id')::uuid end;
      if v_type = 'recipe' and v_first_top is null then
        v_first_top := v_photo_id;
      end if;

      select * into v_existing from public.photos where id = v_photo_id;
      if found then
        if v_existing.user_id is distinct from v_uid
           or v_existing.owner_type <> v_type
           or v_existing.owner_id <> v_owner
           or v_existing.cook_note_id is not null
           or v_existing.recipe_id is distinct from (case when v_type = 'recipe_step' then v_id end) then
          raise exception 'photo_owner_not_found' using errcode = '23503', hint = '照片不屬於這篇食譜';
        end if;
        update public.photos set sort_order = (v_ord - 1)::int where id = v_photo_id;
      else
        insert into public.photos (
          id, user_id, owner_type, owner_id, recipe_id, sort_order,
          storage_path, feed_path, thumb_path, width, height, taken_at
        ) values (
          v_photo_id, v_uid, v_type, v_owner,
          case when v_type = 'recipe_step' then v_id end,
          (v_ord - 1)::int,
          format('users/%s/%s.webp', v_uid, v_photo_id),
          format('users/%s/%s_feed.webp', v_uid, v_photo_id),
          format('users/%s/%s_thumb.webp', v_uid, v_photo_id),
          (v_photo->>'width')::int, (v_photo->>'height')::int,
          nullif(v_photo->>'taken_at', '')::timestamptz
        );
      end if;
    end loop;

    if v_first_top is not null then
      update public.photos set is_cover = true where id = v_first_top;
    end if;
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

revoke execute on function public.save_recipe(jsonb, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.save_recipe(jsonb, timestamptz, jsonb, jsonb) to authenticated;

-- 舊食譜的回填（只給 maintenance 函式，用 service_role 呼叫）：手機沒解析過的食材，由 TypeScript 的解析器算好後送來。
-- 同樣先檢查再存，並重算 ingredient_ids。只改食材欄位，不動版本與其他欄位；已刪除的食譜不處理。
create function public.backfill_recipe_ingredients(p_recipe_id uuid, p_ingredients jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean jsonb := private.clean_recipe_ingredients(p_ingredients);
  v_updated integer;
begin
  update public.recipes
     set ingredients = v_clean,
         ingredient_ids = private.recipe_ingredient_ids(v_clean, ai_tags)
   where id = p_recipe_id
     and deleted_at is null
     -- 只在食材的「原文與順序」沒變時回填，避免蓋掉作者剛存的內容
     and (select coalesce(jsonb_agg(i->>'raw_text' order by o), '[]') from jsonb_array_elements(ingredients) with ordinality as t(i, o))
       = (select coalesce(jsonb_agg(i->>'raw_text' order by o), '[]') from jsonb_array_elements(v_clean) with ordinality as t(i, o))
     and ingredients is distinct from v_clean;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke execute on function public.backfill_recipe_ingredients(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.backfill_recipe_ingredients(uuid, jsonb) to service_role;
