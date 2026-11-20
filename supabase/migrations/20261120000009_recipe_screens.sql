-- 食譜畫面：拿掉標籤與自我評分；照片限制改成上方 5 張、步驟 10 步每步 1 張；
-- 食譜與步驟的照片只經 save_recipe 的 p_photos 寫入（已發佈的改照片也要按「儲存」才生效）。
-- 食譜畫面還沒上線，沒有舊版 App 在用被拿掉的欄位。

---------------------------------------------------------------------------
-- 拿掉標籤與自我評分
---------------------------------------------------------------------------

alter table public.recipes
  drop column rating,
  drop column cuisine_keys,
  drop column dish_type_keys,
  drop column tags;

create or replace function private.is_recipe_cook_notes(value jsonb)
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
          "text": { "type": "string", "maxLength": 500 }
        },
        "additionalProperties": false
      }
    }'::json,
    value
  );
$$;

---------------------------------------------------------------------------
-- 上限：上方照片、每步照片、步驟數
---------------------------------------------------------------------------

alter table public.app_config drop constraint app_config_photo_limits_check;
alter table public.app_config alter column photo_limits set default '{"per_recipe": 5, "per_step": 1, "per_cook_note": 3}';
update public.app_config set photo_limits = '{"per_recipe": 5, "per_step": 1, "per_cook_note": 3}';
alter table public.app_config add constraint app_config_photo_limits_check
  check (extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["per_recipe", "per_step", "per_cook_note"],
      "properties": {
        "per_recipe": { "type": "integer", "minimum": 1 },
        "per_step": { "type": "integer", "minimum": 1 },
        "per_cook_note": { "type": "integer", "minimum": 1 }
      },
      "additionalProperties": false
    }'::json,
    photo_limits
  ));
comment on column public.app_config.photo_limits is
  '每篇食譜上方最多幾張、每個步驟幾張、每次又做了一次最多幾張';
alter table public.app_config add column max_steps integer not null default 10 check (max_steps >= 1);

---------------------------------------------------------------------------
-- 照片觸發器：上方照片、每步照片、又做了一次的照片各自計算
---------------------------------------------------------------------------

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
    elsif new.owner_type = 'recipe_step' then
      v_limit := (v_limits->>'per_step')::int;
      select count(*) into v_count from public.photos p
        where p.owner_type = 'recipe_step' and p.recipe_id = v_recipe_id and p.owner_id = new.owner_id;
    else
      v_limit := (v_limits->>'per_recipe')::int;
      select count(*) into v_count from public.photos p
        where p.owner_type = 'recipe' and p.owner_id = v_recipe_id and p.cook_note_id is null;
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

---------------------------------------------------------------------------
-- 照片權限：食譜與步驟的照片不能由手機直接寫，只經 save_recipe；
-- 又做了一次的照片（P1）維持直接寫
---------------------------------------------------------------------------

drop policy "作者可以新增食譜照片" on public.photos;
drop policy "作者可以改食譜照片" on public.photos;
drop policy "作者可以刪食譜照片" on public.photos;

create policy "作者可以新增又做了一次的照片" on public.photos
  for insert to authenticated
  with check (
    owner_type = 'recipe' and cook_note_id is not null
    and user_id = (select auth.uid()) and private.is_active_user()
  );
create policy "作者可以改又做了一次的照片" on public.photos
  for update to authenticated
  using (owner_type = 'recipe' and cook_note_id is not null and user_id = (select auth.uid()))
  with check (
    owner_type = 'recipe' and cook_note_id is not null
    and user_id = (select auth.uid()) and private.is_active_user()
  );
create policy "作者可以刪又做了一次的照片" on public.photos
  for delete to authenticated
  using (
    owner_type = 'recipe' and cook_note_id is not null
    and user_id = (select auth.uid()) and private.is_active_user()
  );

---------------------------------------------------------------------------
-- save_recipe：拿掉標籤與評分、加步驟上限與 p_photos
---------------------------------------------------------------------------

drop function public.save_recipe(jsonb, timestamptz, jsonb);

-- 新增或更新食譜（含草稿）。
-- p_recipe：JSON 物件，id 必填（手機產生的 UUID v7）；只送有改的欄位，沒送的維持原值。
--   可以寫的欄位：lang、title、story、highlights、cooked_at、kitchen_id、cook_notes、servings、difficulty、
--   ingredients、steps、tips、equipment_used_ids、ai_tags、source、visibility、parent_recipe_id。
--   狀態、發佈時間、版本與衍生欄位由資料庫決定，送了會被拒絕。步驟最多 app_config.max_steps 步。
-- p_expected_updated_at：更新時必填，要和資料庫目前的 updated_at 一致，不一致就拒絕（recipe_conflict）；
--   id 還不存在時新增一篇草稿（廚房預設為目前的廚房）。
-- p_private：選填，{ dictation, diners }，同一個交易存進 recipe_private。
-- p_photos：選填，這篇食譜上方照片與步驟照片的完整清單，依序 [{ id, owner_type: 'recipe'|'recipe_step',
--   owner_id（步驟照片是步驟 id）, width, height, taken_at }]；沒送就不動照片。
--   不在清單裡的刪掉；第一張上方照片是封面；上方最多 photo_limits.per_recipe 張、每步 per_step 張。
create function public.save_recipe(
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
