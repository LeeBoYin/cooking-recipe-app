-- 食譜版本（M1b-02）：recipe_revisions、save_recipe 同一個交易寫一版、發佈時留第一版、還原。
-- 只有已發佈的食譜留版本、每篇最多留最近 20 版；只在做法（食材、步驟、料理筆記、份量、難易度）改變時新增一版。
-- 版本只有作者讀得到，手機不能直接寫，全部經 save_recipe／publish_recipe／restore_recipe_revision。

create table public.recipe_revisions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null check (version >= 1),
  -- 做法的內容：title、servings、difficulty、ingredients、steps、tips
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  changed_by text not null check (changed_by in ('author', 'ai_refine', 'ai_dictation')),
  created_at timestamptz not null default now(),
  unique (recipe_id, version)
);
create index recipe_revisions_user_id_idx on public.recipe_revisions (user_id);

alter table public.recipe_revisions enable row level security;
revoke all on public.recipe_revisions from anon, authenticated;
grant select on public.recipe_revisions to authenticated;

create policy "作者讀版本" on public.recipe_revisions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 把食譜目前的做法寫成一版，並只留最近 20 版
create function private.write_recipe_revision(p_recipe public.recipes, p_changed_by text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.recipe_revisions (recipe_id, user_id, version, snapshot, changed_by)
  values (
    p_recipe.id, p_recipe.user_id, p_recipe.version,
    jsonb_build_object(
      'title', p_recipe.title,
      'servings', p_recipe.servings,
      'difficulty', p_recipe.difficulty,
      'ingredients', p_recipe.ingredients,
      'steps', p_recipe.steps,
      'tips', p_recipe.tips
    ),
    p_changed_by
  )
  on conflict (recipe_id, version) do nothing;

  delete from public.recipe_revisions
  where recipe_id = p_recipe.id
    and version <= (
      select r.version from public.recipe_revisions r
      where r.recipe_id = p_recipe.id
      order by r.version desc offset 20 limit 1
    );
end;
$$;
revoke execute on function private.write_recipe_revision(public.recipes, text) from public, anon, authenticated;

drop function public.save_recipe(jsonb, timestamptz, jsonb, jsonb);

create function public.save_recipe(
  p_recipe jsonb,
  p_expected_updated_at timestamptz default null,
  p_private jsonb default null,
  p_photos jsonb default null,
  p_changed_by text default 'author'
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
  if p_changed_by is null or p_changed_by not in ('author', 'ai_refine', 'ai_dictation') then
    raise exception 'invalid_changed_by' using errcode = '22023';
  end if;
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

  -- 已發佈的食譜，做法改變就留下新的一版（草稿不留）
  if v_new.status = 'published' and v_new.version <> v_old.version then
    perform private.write_recipe_revision(v_new, p_changed_by);
  end if;

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

revoke execute on function public.save_recipe(jsonb, timestamptz, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_recipe(jsonb, timestamptz, jsonb, jsonb, text) to authenticated;

-- 發佈：把當下的做法留成第一版，之後的修改才接得上
create or replace function public.publish_recipe(p_id uuid)
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
  if coalesce(btrim(v_row.title), '') = '' or not exists (
    select 1 from public.photos p
    where (p.owner_type = 'recipe' and p.owner_id = p_id)
       or (p.owner_type = 'recipe_step' and p.recipe_id = p_id)
  ) then
    raise exception 'recipe_empty' using errcode = '22023', hint = '要有照片和菜名才能發佈';
  end if;
  update public.recipes
    set status = 'published', published_at = coalesce(published_at, now())
    where id = p_id
    returning * into v_row;
  perform private.write_recipe_revision(v_row, 'author');
  return v_row;
end;
$$;

-- 還原成某一版：把那一版的內容當成新的一版寫入（版號只增不減），走 save_recipe 同一條路
create function public.restore_recipe_revision(
  p_recipe_id uuid,
  p_version integer,
  p_expected_updated_at timestamptz
)
returns public.recipes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  if not private.is_active_user() then
    raise exception 'account_not_active' using errcode = '42501';
  end if;
  select r.snapshot into v_snapshot
  from public.recipe_revisions r
  where r.recipe_id = p_recipe_id and r.version = p_version and r.user_id = (select auth.uid());
  if not found then
    raise exception 'revision_not_found' using errcode = 'P0002';
  end if;
  return public.save_recipe(
    jsonb_build_object('id', p_recipe_id) || v_snapshot,
    p_expected_updated_at, null, null, 'author'
  );
end;
$$;
revoke execute on function public.restore_recipe_revision(uuid, integer, timestamptz) from public, anon;
grant execute on function public.restore_recipe_revision(uuid, integer, timestamptz) to authenticated;

-- 產品事件白名單加「版本還原」（和 packages/core/src/track/events.ts 一致）
create or replace function private.product_event_names()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'app.open', 'screen.view',
    'record.start', 'record.publish', 'record.abandon', 'record.draft_saved', 'record.draft_published',
    'recipe.revision_restored',
    'chat.start', 'chat.message_sent',
    'suggestion.shown', 'suggestion.opened', 'suggestion.bookmarked', 'suggestion.recorded',
    'onboarding.step', 'taste.answered', 'settings.changed', 'error'
  ]
$$;
