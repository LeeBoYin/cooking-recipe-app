-- M0 的第一個帳號（16 第八節）：在 Supabase 後台建立帳號後，於 SQL Editor 執行
--   select private.init_first_admin('你的 email');
-- 建立註冊時的資料、自己的廚房，並設為系統管理員。只有資料庫擁有者能執行，不經 API 公開。
create function private.init_first_admin(p_email text, p_display_name text default '我')
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_kitchen_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_user_id is null then
    raise exception 'user_not_found: 先在 Authentication → Users 建立這個帳號' using errcode = 'P0002';
  end if;

  v_kitchen_id := public.setup_new_user(v_user_id, p_display_name);
  update public.user_profiles set role = 'system_admin' where user_id = v_user_id;
  return v_kitchen_id;
end;
$$;

revoke execute on function private.init_first_admin(text, text) from public, authenticated, service_role;
