-- 收藏（05 Bookmark；16 第三、四、五節）。M0 只收大廚的點子（kind = 'chef_idea'）；
-- 朋友的食譜（recipe_id、title_snapshot 等欄位與 kind 'friend_recipe'）M2-06 再加。
-- 資料列只經 bookmark_recipe 建立、經 unbookmark_recipe 移除（軟刪除）；手機只能直接改 note 與 cooked_recipe_id。

create table public.bookmarks (
  id uuid primary key check (private.is_uuid_v7(id)),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('chef_idea')),
  -- 點子當下的快照：菜名、理由、來源的家常菜
  idea jsonb not null check (extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["schemaVersion", "title", "baseDishId"],
      "properties": {
        "schemaVersion": { "const": 1 },
        "title": { "type": "string", "minLength": 1, "maxLength": 40 },
        "why": { "type": "string", "maxLength": 120 },
        "baseDishId": { "type": "string", "maxLength": 80 }
      },
      "additionalProperties": false
    }'::json, idea)),
  -- 衍生：家常菜的主要食材（不含調味），由 bookmark_recipe 算，收藏時定下
  idea_ingredient_ids text[] not null default '{}',
  -- 從這個收藏記錄了自己的版本後，連到那一篇；有值就是「做過了」
  cooked_recipe_id uuid references public.recipes (id) on delete set null,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 同一道家常菜每人只能收藏一筆
create unique index bookmarks_one_per_dish on public.bookmarks (user_id, (idea ->> 'baseDishId'))
  where kind = 'chef_idea' and deleted_at is null;
create index bookmarks_user_created on public.bookmarks (user_id, created_at desc) where deleted_at is null;
create index bookmarks_idea_ingredients on public.bookmarks using gin (idea_ingredient_ids);
create index bookmarks_cooked_recipe on public.bookmarks (cooked_recipe_id) where cooked_recipe_id is not null;

create function private.bookmarks_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.user_id := old.user_id;
    new.kind := old.kind;
    new.idea := old.idea;
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

create trigger bookmarks_before_write before insert or update on public.bookmarks
  for each row execute function private.bookmarks_before_write();

alter table public.bookmarks enable row level security;

revoke all on public.bookmarks from anon, authenticated;
grant select on public.bookmarks to authenticated;
grant update (note, cooked_recipe_id) on public.bookmarks to authenticated;

create policy "本人讀自己的收藏" on public.bookmarks
  for select to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null);
create policy "本人修改自己的收藏" on public.bookmarks
  for update to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null)
  with check (user_id = (select auth.uid()) and private.is_active_user());

---------------------------------------------------------------------------
-- bookmark_recipe：收藏大廚的點子。同一道家常菜已經收藏就回傳既有那筆。
-- 主要食材（不含調味）由字典算出，不信任手機送來的值
---------------------------------------------------------------------------

create function public.bookmark_recipe(p_id uuid, p_title text, p_why text, p_base_dish_id text)
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
      'baseDishId', p_base_dish_id
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
-- unbookmark_recipe：取消收藏（軟刪除）。已經不在或不是自己的，什麼都不做
---------------------------------------------------------------------------

create function public.unbookmark_recipe(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.bookmarks set deleted_at = now()
  where id = p_id and user_id = v_user and deleted_at is null;
end;
$$;

revoke execute on function public.bookmark_recipe(uuid, text, text, text) from public, anon;
revoke execute on function public.unbookmark_recipe(uuid) from public, anon;
grant execute on function public.bookmark_recipe(uuid, text, text, text) to authenticated;
grant execute on function public.unbookmark_recipe(uuid) to authenticated;
