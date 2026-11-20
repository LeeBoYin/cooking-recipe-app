-- 食材：誰能讀寫、add／remove／restore 的規則、期限與維護（16 第三、四節）
begin;
select plan(46);

-- 執行一句 UPDATE，回傳改到幾列（用呼叫者的權限執行，RLS 照常生效）
create function tests.updated_rows(p_sql text)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function tests.updated_rows(text) to authenticated;

select tests.create_user('owner@zhusha.test') as owner \gset
select tests.create_user('stranger@zhusha.test') as stranger \gset
select tests.create_user('exmember@zhusha.test', false) as exmember \gset
select tests.kitchen_of(:'owner') as k1 \gset
select tests.kitchen_of(:'stranger') as k2 \gset

-- 前成員：加入後又離開
insert into public.kitchen_members (id, kitchen_id, user_id, role, left_at)
  values (private.uuid_v7(), :'k1', :'exmember', 'member', now());

-- 固定廚房時區，並準備兩種測試用的字典食材
update public.kitchens set timezone = 'Asia/Taipei' where id in (:'k1', :'k2');
insert into public.dict_ingredients (id, name, family, category, default_storage, is_perishable)
  values ('pt-shrimp', '{"zh-TW": "測試蝦"}', 'pt-shrimp-family', 'seafood', 'freezer', true),
         ('pt-salt', '{"zh-TW": "測試鹽"}', 'pt-salt-family', 'seasoning', 'seasoning', false);

select (now() at time zone 'Asia/Taipei')::date::text as today \gset
select private.uuid_v7() as id_shrimp \gset
select private.uuid_v7() as id_shrimp_b \gset
select private.uuid_v7() as id_sauce \gset
select private.uuid_v7() as id_dup \gset
select private.uuid_v7() as id_salt \gset
select private.uuid_v7() as id_salt2 \gset
select private.uuid_v7() as id_salt3 \gset
select private.uuid_v7() as id_other \gset
select private.uuid_v7() as id_direct \gset

---------------------------------------------------------------------------
-- 新增
---------------------------------------------------------------------------
select tests.login_as(:'owner');

select is(
  (select count(*)::int from public.add_pantry_items(:'k1', jsonb_build_array(
    jsonb_build_object('id', :'id_shrimp', 'ingredient_id', 'pt-shrimp', 'raw_name', '蝦仁'),
    jsonb_build_object('id', :'id_sauce', 'raw_name', '阿嬤的辣醬', 'want_to_use_soon', true)))),
  2, '成員一次加入兩樣食材');
select is((select zone from public.pantry_items where id = :'id_shrimp'), 'freezer', '沒指定放哪裡時用字典的預設');
select is((select zone from public.pantry_items where id = :'id_sauce'), 'pantry', '對應不到字典時放 pantry');
select is((select added_on::text from public.pantry_items where id = :'id_shrimp'), :'today', '加入日期是廚房時區的今天');
select is((select created_by from public.pantry_items where id = :'id_shrimp'), :'owner'::uuid, '記下是誰加的');
select is((select want_to_use_soon from public.pantry_items where id = :'id_sauce'), true, '可以標記想先用掉');

-- 同一個 id 重送（網路重試）不會重複新增
select is(
  (select count(*)::int from public.add_pantry_items(:'k1', jsonb_build_array(
    jsonb_build_object('id', :'id_sauce', 'raw_name', '阿嬤的辣醬')))),
  1, '重送同一個 id 原樣回傳');
select is((select count(*)::int from public.pantry_items where raw_name = '阿嬤的辣醬'), 1, '重送不會多一筆');

-- 自由文字同名：不處理，兩筆都留
select lives_ok(
  format($$select * from public.add_pantry_items(%L, jsonb_build_array(
    jsonb_build_object('id', %L, 'raw_name', '阿嬤的辣醬')))$$, :'k1', :'id_dup'),
  '自由文字同名可以再加');
select is((select count(*)::int from public.pantry_items where raw_name = '阿嬤的辣醬'), 2, '自由文字同名兩筆都留');

-- 同一批裡出現同一種食材：合併成一筆，保留較早的期限
select is(
  (select count(*)::int from public.add_pantry_items(:'k1', jsonb_build_array(
    jsonb_build_object('id', :'id_salt', 'ingredient_id', 'pt-salt', 'raw_name', '鹽', 'expires_at', '2027-06-01', 'date_type', 'best-before'),
    jsonb_build_object('id', :'id_salt2', 'ingredient_id', 'pt-salt', 'raw_name', '鹽', 'expires_at', '2027-03-01', 'date_type', 'use-by')))),
  2, '同一批重複的食材也各回傳一筆');
select is(
  (select count(*)::int from public.pantry_items where ingredient_id = 'pt-salt' and status = 'active'), 1,
  '同一種食材只有一筆「有」');
select is((select expires_at::text from public.pantry_items where ingredient_id = 'pt-salt'), '2027-03-01', '保留較早的期限');
select is((select date_type from public.pantry_items where ingredient_id = 'pt-salt'), 'use-by', '期限的種類跟著較早的期限');
select is((select expiry_set_on::text from public.pantry_items where ingredient_id = 'pt-salt'), :'today', '資料庫填設定期限的日期');

-- 再加入已有的食材：更新加入日期、期限比較晚就不蓋掉
select tests.logout();
update public.pantry_items set added_on = '2026-01-01' where ingredient_id = 'pt-salt';
select tests.login_as(:'owner');
select lives_ok(
  format($$select * from public.add_pantry_items(%L, jsonb_build_array(
    jsonb_build_object('id', %L, 'ingredient_id', 'pt-salt', 'raw_name', '鹽', 'expires_at', '2027-09-01')))$$,
    :'k1', :'id_salt3'),
  '再加入已有的食材');
select is((select added_on::text from public.pantry_items where ingredient_id = 'pt-salt'), :'today', '再加入時更新加入日期');
select is((select expires_at::text from public.pantry_items where ingredient_id = 'pt-salt'), '2027-03-01', '較晚的期限不會蓋掉較早的');

-- 不是成員、前成員、參數錯誤
select tests.login_as(:'stranger');
select throws_ok(
  format($$select * from public.add_pantry_items(%L, jsonb_build_array(jsonb_build_object('id', %L, 'raw_name', '蛋')))$$,
    :'k1', :'id_other'),
  '42501', 'not_a_kitchen_member', '不是成員不能加食材');
select tests.login_as(:'exmember');
select throws_ok(
  format($$select * from public.add_pantry_items(%L, jsonb_build_array(jsonb_build_object('id', %L, 'raw_name', '蛋')))$$,
    :'k1', :'id_other'),
  '42501', 'not_a_kitchen_member', '前成員不能加食材');
select tests.login_as(:'owner');
select throws_ok(
  format($$select * from public.add_pantry_items(%L, '[]'::jsonb)$$, :'k1'),
  '22023', 'invalid_items', '空的清單會被拒絕');

---------------------------------------------------------------------------
-- 讀取與直接寫入
---------------------------------------------------------------------------
select tests.login_as(:'stranger');
select lives_ok(
  format($$select * from public.add_pantry_items(%L, jsonb_build_array(jsonb_build_object('id', %L, 'raw_name', '別人的蛋')))$$,
    :'k2', :'id_other'),
  '另一個廚房的成員加自己的食材');
select is((select count(*)::int from public.pantry_items where kitchen_id = :'k1'), 0, '不是成員看不到別的廚房的食材');

select tests.login_as(:'exmember');
select is((select count(*)::int from public.pantry_items), 0, '前成員看不到食材');

select tests.login_as(:'owner');
select is((select count(*)::int from public.pantry_items where kitchen_id = :'k2'), 0, '成員看不到別的廚房的食材');
select throws_ok(
  format($$insert into public.pantry_items (id, kitchen_id, raw_name, zone, added_on) values (%L, %L, '蛋', 'fridge', current_date)$$,
    :'id_direct', :'k1'),
  '42501', null, '不能直接新增（要經 add_pantry_items）');
select throws_ok(
  format($$delete from public.pantry_items where id = %L$$, :'id_sauce'),
  '42501', null, '不能直接刪除（要經 remove_pantry_item）');
select lives_ok(
  format($$update public.pantry_items set note = '放在冰箱門邊', zone = 'fridge' where id = %L$$, :'id_sauce'),
  '成員可以改放哪裡與備註');
select is((select note from public.pantry_items where id = :'id_sauce'), '放在冰箱門邊', '備註已經更新');
select throws_ok(
  format($$update public.pantry_items set raw_name = '別的名字' where id = %L$$, :'id_sauce'),
  '42501', null, '不能改原本輸入的名稱');
select throws_ok(
  format($$update public.pantry_items set status = 'removed' where id = %L$$, :'id_sauce'),
  '42501', null, '不能直接改狀態');

select tests.login_as(:'stranger');
select is(
  tests.updated_rows(format($$update public.pantry_items set note = '偷改' where id = %L$$, :'id_sauce')),
  0, '不是成員改不到別的廚房的食材');

---------------------------------------------------------------------------
-- 期限
---------------------------------------------------------------------------
select tests.login_as(:'owner');
update public.pantry_items set expires_at = '2027-05-01', date_type = 'best-before' where id = :'id_sauce';
select is((select expiry_set_on::text from public.pantry_items where id = :'id_sauce'), :'today', '設定期限時填「設定那天」');

select tests.logout();
update public.pantry_items set alert_tier = 'soon', alert_on = '2027-04-01' where id = :'id_sauce';
select tests.login_as(:'owner');
update public.pantry_items set expires_at = '2027-08-01' where id = :'id_sauce';
select is((select alert_tier from public.pantry_items where id = :'id_sauce'), null, '改期限時清空提醒狀態');

update public.pantry_items set expires_at = null where id = :'id_sauce';
select is(
  (select expiry_set_on is null and date_type is null from public.pantry_items where id = :'id_sauce'), true,
  '清掉期限時，種類與設定日期一起清掉');

---------------------------------------------------------------------------
-- 移除與復原
---------------------------------------------------------------------------
select is((select (public.remove_pantry_item(:'id_shrimp')).status), 'removed', '移除食材');
select is((select removed_by from public.pantry_items where id = :'id_shrimp'), :'owner'::uuid, '記下是誰移除的');
select lives_ok(format($$select public.remove_pantry_item(%L)$$, :'id_shrimp'), '重複移除沒有影響');
select is(
  tests.updated_rows(format($$update public.pantry_items set note = '改已移除的' where id = %L$$, :'id_shrimp')),
  0, '已移除的食材不能直接修改');

select tests.login_as(:'stranger');
select throws_ok(
  format($$select public.remove_pantry_item(%L)$$, :'id_sauce'),
  'P0002', 'pantry_item_not_found', '不是成員不能移除');

select tests.login_as(:'owner');
select is((select (public.restore_pantry_item(:'id_shrimp')).status), 'active', '復原食材');

-- 復原時同一種食材已經又被加回來：併進現有那一筆，被復原的維持移除
select public.remove_pantry_item(:'id_shrimp');
select tests.logout();
update public.pantry_items set added_on = '2026-02-01' where id = :'id_shrimp';
select tests.login_as(:'owner');
select public.add_pantry_items(:'k1', jsonb_build_array(
  jsonb_build_object('id', :'id_shrimp_b', 'ingredient_id', 'pt-shrimp', 'raw_name', '蝦仁')));
select is((select (public.restore_pantry_item(:'id_shrimp')).id), :'id_shrimp_b'::uuid, '復原時回傳現有的那一筆');
select is((select status from public.pantry_items where id = :'id_shrimp'), 'removed', '被復原的那一筆維持移除');
select is((select added_on::text from public.pantry_items where id = :'id_shrimp_b'), '2026-02-01', '併入時保留較早的加入日期');

---------------------------------------------------------------------------
-- 維護與即時同步
---------------------------------------------------------------------------
select tests.logout();
update public.pantry_items set status = 'removed', removed_at = now() - interval '31 days' where id = :'id_dup';
select is(private.purge_removed_pantry_items(), 1, '清掉移除超過 30 天的食材');
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pantry_items'),
  '食材的變動會即時推給同廚房的成員');

select * from finish();
rollback;
