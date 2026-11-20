-- 廚具：字典匯入的檢查、誰能讀寫、選配手法與欄位限制（16 第三、四節）
begin;
select plan(22);

-- 執行一句 UPDATE／DELETE，回傳改到幾列（用呼叫者的權限執行，RLS 照常生效）
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
select tests.create_user('mate@zhusha.test') as mate \gset
select tests.create_user('stranger@zhusha.test') as stranger \gset
select tests.kitchen_of(:'owner') as k1 \gset
select tests.kitchen_of(:'stranger') as k2 \gset
-- 室友加入 k1
insert into public.kitchen_members (id, kitchen_id, user_id, role)
  values (private.uuid_v7(), :'k1', :'mate', 'member');

-- 測試用字典（不依賴本機 seed）
insert into public.dict_techniques (id, name, technique_group)
  values ('t-bake', '{"zh-TW": "烘焙"}', 'heat'), ('t-airfry', '{"zh-TW": "氣炸"}', 'heat');
insert into public.dict_equipment_types (id, name, category, techniques, optional_techniques, requires_heat_source, is_heat_source, onboarding, dishwasher_safe, icon_key)
  values ('e-oven', '{"zh-TW": "測試烤箱"}', 'appliance', '{t-bake}', '{t-airfry}', false, false, '{"default": "show"}', 'partial', 'e-oven'),
         ('e-gas', '{"zh-TW": "測試爐"}', 'heat-source', '{}', '{}', false, true, '{"default": "default-on", "byRegion": {"US": "show"}}', 'n/a', 'e-gas');

select private.uuid_v7() as id1 \gset
select private.uuid_v7() as id2 \gset
select private.uuid_v7() as id3 \gset
select private.uuid_v7() as id4 \gset

---------------------------------------------------------------------------
-- 字典匯入
---------------------------------------------------------------------------
select throws_ok($$insert into public.dict_equipment_types (id, name, category, requires_heat_source, is_heat_source, onboarding, dishwasher_safe, icon_key)
  values ('e-bad', '{"zh-TW": "壞的"}', 'appliance', false, false, '{"default": "sometimes"}', 'no', 'x')$$,
  '23514', null, '新手盤點的值要合法');
select throws_ok($$select private.import_dictionaries('{"version": "v1", "allergens": [], "ingredients": [], "dietaryRestrictions": [],
  "techniques": [{"id": "t-bake", "name": {"zh-TW": "烘焙"}, "group": "heat"}, {"id": "t-airfry", "name": {"zh-TW": "氣炸"}, "group": "heat"}],
  "equipmentTypes": [{"id": "e-oven", "name": {"zh-TW": "測試烤箱"}, "category": "appliance", "techniques": ["t-bake"],
    "requiresHeatSource": false, "isHeatSource": false, "onboarding": {"default": "show"}, "dishwasherSafe": "no", "iconKey": "e-oven"},
    {"id": "e-gas", "name": {"zh-TW": "測試爐"}, "category": "heat-source", "requiresHeatSource": false, "isHeatSource": true,
    "onboarding": {"default": "show"}, "dishwasherSafe": "n/a", "iconKey": "e-gas"}, {"id": "e-x", "name": {"zh-TW": "怪鍋"}, "category": "cookware", "techniques": ["t-mystery"],
    "requiresHeatSource": true, "isHeatSource": false, "onboarding": {"default": "show"}, "dishwasherSafe": "no", "iconKey": "e-x"}]}')$$,
  '23503', null, '廚具參照的手法要存在');

---------------------------------------------------------------------------
-- 新增：成員可以，外人與前成員不行
---------------------------------------------------------------------------
select tests.login_as(:'owner');
insert into public.kitchen_equipment (id, kitchen_id, equipment_type_id, raw_name, brand, capacity_value, capacity_unit, enabled_optional_techniques)
  values (:'id1', :'k1', 'e-oven', '我的烤箱', 'Acme', 60, 'l', '{t-airfry}');
select is((select count(*)::int from public.kitchen_equipment where kitchen_id = :'k1'), 1, '成員可以新增廚具');
select is((select created_by from public.kitchen_equipment where id = :'id1'), :'owner'::uuid, '由資料庫記下是誰新增的');
select throws_ok(format($$insert into public.kitchen_equipment (id, kitchen_id, raw_name) values ('%s', '%s', '別人的廚房')$$, :'id2', :'k2'),
  '42501', null, '不能新增到別人的廚房');
select tests.logout();

select tests.login_as(:'stranger');
select is((select count(*)::int from public.kitchen_equipment), 0, '外人看不到別的廚房的廚具');
select is(tests.updated_rows(format($$update public.kitchen_equipment set raw_name = '被改了' where id = '%s'$$, :'id1')), 0, '外人改不到');
select is(tests.updated_rows(format($$delete from public.kitchen_equipment where id = '%s'$$, :'id1')), 0, '外人刪不掉');
select tests.logout();

---------------------------------------------------------------------------
-- 同廚房的成員共用：看、改、刪
---------------------------------------------------------------------------
select tests.login_as(:'mate');
select is((select count(*)::int from public.kitchen_equipment), 1, '同廚房的成員看得到');
select is(tests.updated_rows(format($$update public.kitchen_equipment set description = '阿嬤傳下來的' where id = '%s'$$, :'id1')), 1, '成員可以改');
select is((select updated_by from public.kitchen_equipment where id = :'id1'), :'mate'::uuid, '記下是誰改的');
select throws_ok(format($$update public.kitchen_equipment set kitchen_id = '%s' where id = '%s'$$, :'k2', :'id1'),
  '42501', null, '不能搬到別的廚房');
select throws_ok(format($$update public.kitchen_equipment set created_by = '%s' where id = '%s'$$, :'mate', :'id1'),
  '42501', null, '不能改建立者');

-- 自訂廚具：不對應字典
insert into public.kitchen_equipment (id, kitchen_id, raw_name) values (:'id3', :'k1', '阿嬤的鐵鍋');
select is((select equipment_type_id from public.kitchen_equipment where id = :'id3'), null, '自訂廚具可以不對應字典');
select tests.logout();

---------------------------------------------------------------------------
-- 欄位限制
---------------------------------------------------------------------------
select tests.login_as(:'owner');
select throws_ok(format($$update public.kitchen_equipment set enabled_optional_techniques = '{t-bake}' where id = '%s'$$, :'id1'),
  '23514', null, '選配手法只能是字典列出的（本身就有的手法也不行）');
select throws_ok(format($$update public.kitchen_equipment set enabled_optional_techniques = '{t-airfry}' where id = '%s'$$, :'id3'),
  '23514', null, '自訂廚具不能有選配手法');
select throws_ok(format($$update public.kitchen_equipment set capacity_unit = null where id = '%s'$$, :'id1'),
  '23514', null, '容量的數字和單位要一起填');
select throws_ok(format($$insert into public.kitchen_equipment (id, kitchen_id, raw_name, capacity_value, capacity_unit) values ('%s', '%s', '壞容量', 0, 'l')$$, :'id4', :'k1'),
  '23514', null, '容量要大於 0');
select throws_ok(format($$insert into public.kitchen_equipment (id, kitchen_id, raw_name) values ('%s', '%s', '   ')$$, :'id4', :'k1'),
  '23514', null, '名字不能空白');
select throws_ok(format($$insert into public.kitchen_equipment (id, kitchen_id, raw_name) values ('%s', '%s', 'x')$$, '00000000-0000-4000-8000-000000000000', :'k1'),
  '23514', null, 'ID 要是 UUID v7');

---------------------------------------------------------------------------
-- 刪除、停用帳號
---------------------------------------------------------------------------
select is(tests.updated_rows(format($$delete from public.kitchen_equipment where id = '%s'$$, :'id3')), 1, '成員可以刪除');
select tests.logout();

update public.user_profiles set status = 'suspended' where user_id = :'owner';
select tests.login_as(:'owner');
select throws_ok(format($$insert into public.kitchen_equipment (id, kitchen_id, raw_name) values ('%s', '%s', '停用中')$$, :'id4', :'k1'),
  '42501', null, '停用的帳號不能寫');
select tests.logout();

select * from finish();
rollback;
