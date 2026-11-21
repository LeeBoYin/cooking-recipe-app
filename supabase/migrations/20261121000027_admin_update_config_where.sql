-- admin_update_config 的 UPDATE 沒有 WHERE：Supabase 的 pg_safeupdate 對 API 連線擋下（21000），
-- 資料庫擁有者跑的 pgTAP 不受影響所以沒測到。app_config 只有一列（id 恆為 true），補上 where。
create or replace function public.admin_update_config(
  p_admin uuid,
  p_max_users integer default null,
  p_soft_delete_retention_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.app_config;
  v_new public.app_config;
begin
  perform private.assert_admin(p_admin);
  if (p_max_users is not null and p_max_users not between 1 and 1000)
     or (p_soft_delete_retention_days is not null and p_soft_delete_retention_days not between 1 and 365) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into v_old from public.app_config c where c.id for update;
  update public.app_config c
    set max_users = coalesce(p_max_users, c.max_users),
        soft_delete_retention_days = coalesce(p_soft_delete_retention_days, c.soft_delete_retention_days)
    where c.id
    returning * into v_new;
  perform private.audit_admin(p_admin, 'config.update', 'app_config', null, jsonb_build_object(
    'before', jsonb_build_object('max_users', v_old.max_users, 'soft_delete_retention_days', v_old.soft_delete_retention_days),
    'after', jsonb_build_object('max_users', v_new.max_users, 'soft_delete_retention_days', v_new.soft_delete_retention_days)
  ));
  return jsonb_build_object('max_users', v_new.max_users, 'soft_delete_retention_days', v_new.soft_delete_retention_days);
end;
$$;

revoke execute on function public.admin_update_config(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_update_config(uuid, integer, integer) to service_role;
