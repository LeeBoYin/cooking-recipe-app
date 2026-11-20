-- 慣例與擴充套件（16 第一、二節）
-- 共用的輔助函式放在 private schema：不經 API 公開，只給權限規則與資料庫函式使用。

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_jsonschema with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgroonga with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- 新的資料表不自動開放給 API 角色，每張表自己授權
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- ID 一律是 UUID v7（手機產生；後端需要時用 private.uuid_v7()）
create function private.is_uuid_v7(id uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select substr(id::text, 15, 1) = '7';
$$;

create function private.uuid_v7()
returns uuid
language sql
volatile
set search_path = ''
as $$
  select encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          placing substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
          from 1 for 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$;

-- created_at 不能改、updated_at 由資料庫設定
create function private.set_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

grant execute on function private.is_uuid_v7(uuid) to authenticated, service_role;
grant execute on function private.uuid_v7() to service_role;

-- 沒有 created_at 的表（例：kitchen_members 用 joined_at）只設定 updated_at
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
