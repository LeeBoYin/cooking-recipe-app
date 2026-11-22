---------------------------------------------------------------------------
-- M1a-10b：AI 輸出的檢查結果、背景任務放棄時的錯誤紀錄
---------------------------------------------------------------------------

-- 一、AI 輸出的檢查結果（對話被擋下的比率用）。
-- 只記代號，不記內容。一次請求記在它最後一次呼叫 Claude 的那一筆上：
--   passed：第一次就通過檢查；rewritten：重寫後通過；blocked：沒過檢查（invalid_output），這一次沒有結果給使用者。
-- 只有 chat、home_ideas、expand_steps 會記；其他任務與沒走到檢查的呼叫（出錯、被擋下、逾時）是 null。
alter table public.ai_usage_records
  add column outcome text check (outcome in ('passed', 'rewritten', 'blocked'));

-- 後端在檢查完之後呼叫：把這個人這個任務最近一筆還沒有結果的紀錄補上結果（10 分鐘內）。
-- 同一個人同一個任務同時有兩個請求時可能補錯一筆，只影響統計的比率，不影響任何功能。
create function public.ai_record_outcome(p_user uuid, p_task text, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome is null or p_outcome not in ('passed', 'rewritten', 'blocked') then
    raise exception '結果代號不在清單內' using errcode = '22023';
  end if;
  update public.ai_usage_records
     set outcome = p_outcome
   where id = (
     select r.id from public.ai_usage_records r
      where r.user_id = p_user and r.task = p_task and r.outcome is null
        and r.created_at > now() - interval '10 minutes'
      order by r.created_at desc
      limit 1
   );
end;
$$;
revoke execute on function public.ai_record_outcome(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ai_record_outcome(uuid, text, text) to service_role;

-- 二、背景任務放棄（dead）時寫一筆錯誤紀錄：來源 edge_function、類型 background_job_dead、
-- 位置「任務種類:錯誤代號」。不記食材原文或任何使用者內容；次數由 log_error 一小時內累加。
create function private.log_dead_background_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.log_error(
    'edge_function',
    'background_job_dead',
    new.kind || ':' || coalesce(nullif(left(regexp_replace(lower(coalesce(new.last_error, '')), '[^a-z0-9_]', '_', 'g'), 40), ''), 'unknown'),
    'warning'
  );
  return new;
end;
$$;
revoke execute on function private.log_dead_background_job() from public, anon, authenticated;

create trigger log_dead_job after update of status on public.background_jobs
  for each row when (new.status = 'dead' and old.status is distinct from 'dead')
  execute function private.log_dead_background_job();
