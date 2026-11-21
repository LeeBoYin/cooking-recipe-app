-- 大廚的點子（M1a-06）：ai_suggestion_cache 的權限、ai_home_context、ai_home_cache_save、飲食限制改了就清快取
begin;
select plan(22);

select tests.create_user('alice@zhusha.test') as alice \gset
select tests.create_user('bob@zhusha.test') as bob \gset
select tests.kitchen_of(:'alice') as ka \gset

---------------------------------------------------------------------------
-- 只有服務權限能寫；本人只能讀自己的
---------------------------------------------------------------------------
set local role service_role;
select lives_ok(
  format($$select public.ai_home_cache_save(%L, %L, 'hash-aaaaaaaa', 0::smallint, '{"schemaVersion":1,"ideas":[],"chefComment":null,"model":"m"}', 24)$$, :'alice', :'ka'),
  '服務權限可以存一輪點子');
reset role;

select tests.login_as(:'alice');
select is((select count(*)::int from public.ai_suggestion_cache), 1, '本人讀得到自己的點子');
select throws_ok(
  format($$insert into public.ai_suggestion_cache (id, user_id, kind, input_hash, expires_at, payload) values (private.uuid_v7(), %L, 'home', 'hash-bbbbbbbb', now() + interval '1 day', '{}')$$, :'alice'),
  '42501', null, '本人不能直接新增');
select throws_ok($$update public.ai_suggestion_cache set payload = '{}'$$, '42501', null, '本人不能直接改');
select throws_ok($$delete from public.ai_suggestion_cache$$, '42501', null, '本人不能直接刪');
select throws_ok(format($$select public.ai_home_context(%L)$$, :'alice'), '42501', null, '本人不能呼叫 ai_home_context');
select throws_ok(
  format($$select public.ai_home_cache_save(%L, null, 'hash-cccccccc', 0::smallint, '{}', 24)$$, :'alice'),
  '42501', null, '本人不能呼叫 ai_home_cache_save');
select tests.logout();

select tests.login_as(:'bob');
select is((select count(*)::int from public.ai_suggestion_cache), 0, '別人讀不到');
select tests.logout();

---------------------------------------------------------------------------
-- ai_home_context
---------------------------------------------------------------------------
set local role service_role;
select is((select public.ai_home_context(:'alice') -> 'kitchen' ->> 'id'), :'ka', '回傳現在的廚房');
select is((select jsonb_array_length(public.ai_home_context(:'alice') -> 'recent')), 1, '附上最近的首頁點子');
select is((select public.ai_home_context(:'alice') -> 'settings' ->> 'chef_persona'), 'warm', '附上大廚的語氣');
select is((select public.ai_home_context(:'alice') -> 'dietary' -> 'allergen_ids'), '[]'::jsonb, '附上飲食限制');
select is((select public.ai_home_context(gen_random_uuid())), null, '沒有這個人就回空');
reset role;

-- 只回現在有的食材，已移除的不算
insert into public.pantry_items (id, kitchen_id, created_by, ingredient_id, raw_name, zone, added_on)
  select private.uuid_v7(), :'ka', :'alice', id, name ->> 'zh-TW', 'fridge', current_date from public.dict_ingredients where id in ('egg', 'tofu');
update public.pantry_items set status = 'removed', removed_at = now(), removed_by = :'alice' where ingredient_id = 'tofu' and kitchen_id = :'ka';
set local role service_role;
select is(
  (select jsonb_agg(p ->> 'ingredient_id') from jsonb_array_elements(public.ai_home_context(:'alice') -> 'pantry') p),
  '["egg"]'::jsonb, '只回現在有的食材');
reset role;

---------------------------------------------------------------------------
-- 每人的首頁點子只留最近 6 筆
---------------------------------------------------------------------------
set local role service_role;
select public.ai_home_cache_save(:'alice', :'ka', 'hash-000' || n, 0::smallint, '{"schemaVersion":1,"ideas":[]}', 24) from generate_series(1, 8) n;
reset role;
select is((select count(*)::int from public.ai_suggestion_cache where user_id = :'alice'), 6, '只留最近 6 筆');

-- 其他欄位的格式
set local role service_role;
select throws_ok(
  format($$select public.ai_home_cache_save(%L, %L, 'hash-dddddddd', 3::smallint, '{}', 24)$$, :'alice', :'ka'),
  '23514', null, '輪數最多 2');
select throws_ok(
  format($$select public.ai_home_cache_save(%L, %L, 'x', 0::smallint, '{}', 24)$$, :'alice', :'ka'),
  '23514', null, '雜湊太短不行');
select throws_ok(
  format($$select public.ai_home_cache_save(%L, %L, 'hash-eeeeeeee', 0::smallint, '[]', 24)$$, :'alice', :'ka'),
  '23514', null, '內容要是物件');
reset role;

---------------------------------------------------------------------------
-- 飲食限制一改，這個人的點子快取全部作廢；別人的不受影響
---------------------------------------------------------------------------
set local role service_role;
select public.ai_home_cache_save(:'bob', (select id from public.kitchens limit 1), 'hash-bobbbbbb', 0::smallint, '{"schemaVersion":1,"ideas":[]}', 24);
reset role;

select tests.login_as(:'alice');
update public.dietary_profiles set no_cooking_alcohol = no_cooking_alcohol where user_id = :'alice';
select is((select count(*)::int from public.ai_suggestion_cache), 6, '值沒變就不清');
update public.dietary_profiles set allergen_ids = '{shrimp}' where user_id = :'alice';
select is((select count(*)::int from public.ai_suggestion_cache), 0, '加了過敏原，點子快取清掉');
select tests.logout();
select is((select count(*)::int from public.ai_suggestion_cache where user_id = :'bob'), 1, '別人的不受影響');

select tests.login_as(:'alice');
select is((select count(*)::int from public.ai_suggestion_cache), 0, '本人看不到舊的點子');
select tests.logout();

select * from finish();
rollback;
