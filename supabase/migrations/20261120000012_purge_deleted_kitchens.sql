---------------------------------------------------------------------------
-- 每日維護：到期的軟刪除廚房真正刪除（05 刪除與保留）
---------------------------------------------------------------------------

-- 廚房軟刪除超過保留天數後真正刪除：食材、廚具、成員、廚房照片的資料列跟著刪掉
-- （食譜只是把 kitchen_id 改成空值）。照片檔由每週的孤兒掃描清掉。回傳刪除幾個廚房。
create function private.purge_deleted_kitchens()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.kitchens
    where deleted_at < now() - make_interval(days => (select soft_delete_retention_days from public.app_config));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function private.purge_deleted_kitchens() from public, anon, authenticated;

create or replace function private.run_daily_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step text;
  v_failed boolean := false;
begin
  foreach v_step in array array[
    'purge_removed_pantry_items', 'purge_deleted_recipes', 'purge_deleted_kitchens', 'purge_old_error_logs'
  ] loop
    begin
      execute format('select private.%I()', v_step);
    exception when others then
      v_failed := true;
      perform private.log_error('cron', 'daily_maintenance_failed', v_step, 'critical');
    end;
  end loop;

  if not v_failed then
    perform private.log_error('cron', 'daily_maintenance_ok', 'daily_maintenance', 'info');
  end if;
end;
$$;
