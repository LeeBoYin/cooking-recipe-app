-- 本機開發用的帳號（只在本機的 supabase db reset 時執行，不會進測試或正式專案）
-- 登入：dev@zhusha.test ／ zhusha-local-dev（本機的系統管理員）
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '019a9f00-0000-7000-8000-000000000001',
  'authenticated', 'authenticated', 'dev@zhusha.test',
  extensions.crypt('zhusha-local-dev', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (
  '019a9f00-0000-7000-8000-000000000002',
  '019a9f00-0000-7000-8000-000000000001',
  '019a9f00-0000-7000-8000-000000000001',
  'email',
  '{"sub":"019a9f00-0000-7000-8000-000000000001","email":"dev@zhusha.test","email_verified":true}',
  now(), now(), now()
);

select public.setup_new_user('019a9f00-0000-7000-8000-000000000001', '開發者');

-- 本機開發帳號同時是系統管理員（後台 /admin 要再綁定兩步驟驗證）
update public.user_profiles set role = 'system_admin' where user_id = '019a9f00-0000-7000-8000-000000000001';
