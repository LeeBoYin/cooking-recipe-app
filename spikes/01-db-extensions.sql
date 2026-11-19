-- 技術驗證 01：資料庫擴充套件與中文搜尋
-- 在 Supabase「測試」專案的 SQL Editor 整段貼上執行（不要在正式專案跑）。
-- 每一段後面寫了預期結果；把各段的輸出貼回給 Claude 判讀。

-- ① 免費方案有沒有這些擴充套件
--    預期：6 列都出現（installed_version 是空的也沒關係，代表還沒啟用）
select name, default_version, installed_version
from pg_available_extensions
where name in ('pgroonga', 'pg_cron', 'pg_net', 'pg_jsonschema', 'pgcrypto', 'pg_trgm')
order by name;

-- ② 啟用（測試專案）
create extension if not exists pgroonga with schema extensions;
create extension if not exists pg_jsonschema with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ③ 中文搜尋：PGroonga
create table if not exists public.spike_recipes (id serial primary key, title text not null);
truncate public.spike_recipes;
insert into public.spike_recipes (title) values
  ('培根高麗菜'), ('高麗菜飯'), ('洋蔥炒蛋'), ('蔥油餅'), ('三杯雞'),
  ('麻婆豆腐'), ('番茄炒蛋'), ('紅燒牛肉麵'), ('阿嬤的滷肉'), ('青蔥炒牛肉');
create index if not exists spike_recipes_title_pgroonga
  on public.spike_recipes using pgroonga (title);

-- 預期：培根高麗菜、高麗菜飯
select '高麗菜' as q, title from public.spike_recipes where title &@~ '高麗菜';
-- 預期：番茄炒蛋、洋蔥炒蛋
select '炒蛋' as q, title from public.spike_recipes where title &@~ '炒蛋';
-- 預期：紅燒牛肉麵（兩個詞都要有）
select '牛肉 麵' as q, title from public.spike_recipes where title &@~ '牛肉 麵';
-- 觀察：全文搜尋一定會把「洋蔥」一起找出來。
-- 規格的做法是食材先用字典的別名對到 ID，再用 ingredient_ids 查，不靠全文搜尋區分（見 05 索引設計）
select '蔥' as q, title from public.spike_recipes where title &@~ '蔥';

-- ④ 對照：沒有 PGroonga 時的退路 pg_trgm
--    觀察：兩個字的中文詞，三字片段比對常常找不到，只能退回 ilike
select 'trgm 高麗菜' as q, title, similarity(title, '高麗菜') as sim
from public.spike_recipes where title % '高麗菜';
select 'ilike 高麗菜' as q, title from public.spike_recipes where title ilike '%高麗菜%';

-- ⑤ pg_jsonschema：預期第一個 true、第二個 false
select
  extensions.jsonb_matches_schema('{"type":"object","required":["text"]}', '{"text":"切蒜"}') as valid_ok,
  extensions.jsonb_matches_schema('{"type":"object","required":["text"]}', '{"order":1}') as invalid_ok;

-- ⑥ pg_cron：預期能建立、查到、再刪除排程
select cron.schedule('spike-noop', '0 3 * * *', 'select 1');
select jobname, schedule from cron.job where jobname = 'spike-noop';
select cron.unschedule('spike-noop');

-- ⑦ pg_net：送出一個 HTTP 請求（幾秒後才有結果）
select net.http_get('https://example.com') as request_id;
-- 等 5 秒後再單獨執行下一行，預期 status_code = 200
-- select id, status_code, left(content, 40) from net._http_response order by id desc limit 1;

-- ⑧ 收尾：刪掉測試資料
-- drop table public.spike_recipes;
