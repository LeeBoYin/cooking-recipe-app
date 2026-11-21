-- 邀請頁顯示「〇〇邀請你…」（12 ③）：accept-invite 用邀請 ID 取邀請者的暱稱。
-- 暱稱本來就是公開身分（user_identities），只回傳暱稱，邀請者已刪除或是服務權限發的邀請回空值。
create function public.invite_inviter_name(p_invite_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select idn.display_name
  from public.invites i
  join public.user_identities idn on idn.user_id = i.invited_by
  where i.id = p_invite_id;
$$;
revoke execute on function public.invite_inviter_name(uuid) from public, anon, authenticated;
grant execute on function public.invite_inviter_name(uuid) to service_role;
