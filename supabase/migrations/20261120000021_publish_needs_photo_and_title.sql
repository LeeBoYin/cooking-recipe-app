-- 發佈：要有菜名，而且至少一張照片（食譜上方或步驟的照片都算）。
-- 只改發佈時的檢查；已經發佈的食譜不受影響（已發佈的重複呼叫直接回傳）。
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
  return v_row;
end;
$$;
