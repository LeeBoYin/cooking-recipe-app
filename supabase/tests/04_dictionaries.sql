-- 字典：誰能讀寫、匯入的規則（16 第三節〈字典〉）
begin;
select plan(11);

-- 先清空，用一份小字典測（不依賴本機 seed 有沒有匯入）
delete from public.dict_base_dishes;
delete from public.dict_quiz_items;
delete from public.dict_preference_dimensions;
delete from public.dict_regions;
delete from public.dict_equipment_types;
delete from public.dict_techniques;
delete from public.dict_dietary_restrictions;
delete from public.dict_ingredients;
delete from public.dict_allergens;

select private.import_dictionaries($json${
  "version": "v1",
  "allergens": [
    { "id": "crustacean", "name": { "zh-TW": "甲殼類" } },
    { "id": "shrimp", "name": { "zh-TW": "蝦" }, "parentId": "crustacean" }
  ],
  "ingredients": [
    { "id": "shrimp", "name": { "zh-TW": "蝦仁" }, "aliases": { "zh-TW": ["蝦"] }, "family": "shrimp-family",
      "traits": ["animal", "seafood", "shellfish"], "category": "seafood", "defaultStorage": "freezer",
      "isPerishable": true, "recentDays": 2, "allergenIds": ["shrimp"] },
    { "id": "salt", "name": { "zh-TW": "鹽" }, "family": "salt-family", "category": "seasoning",
      "defaultStorage": "seasoning", "isPerishable": false }
  ],
  "dietaryRestrictions": [
    { "id": "vegan", "name": { "zh-TW": "全素" }, "excludesTraits": ["animal"] }
  ]
}$json$::jsonb);

select is((select count(*)::int from public.dict_ingredients), 2, '匯入食材');
select is((select version from public.dict_version), 'v1', '記下字典版本');
select is((select parent_id from public.dict_allergens where id = 'shrimp'), 'crustacean', '過敏原的上層');

-- 重新匯入：更新內容
select private.import_dictionaries($json${
  "version": "v2",
  "allergens": [
    { "id": "crustacean", "name": { "zh-TW": "甲殼類（蝦蟹）" } },
    { "id": "shrimp", "name": { "zh-TW": "蝦" }, "parentId": "crustacean" }
  ],
  "ingredients": [
    { "id": "shrimp", "name": { "zh-TW": "蝦仁" }, "family": "shrimp-family", "traits": ["animal", "seafood", "shellfish"],
      "category": "seafood", "defaultStorage": "freezer", "isPerishable": true, "allergenIds": ["shrimp"] },
    { "id": "salt", "name": { "zh-TW": "鹽" }, "family": "salt-family", "category": "seasoning",
      "defaultStorage": "seasoning", "isPerishable": false, "deprecated": true }
  ],
  "dietaryRestrictions": [{ "id": "vegan", "name": { "zh-TW": "全素" }, "excludesTraits": ["animal"] }]
}$json$::jsonb);
select is((select name ->> 'zh-TW' from public.dict_allergens where id = 'crustacean'), '甲殼類（蝦蟹）', '重新匯入會更新內容');
select is((select deprecated from public.dict_ingredients where id = 'salt'), true, '淘汰用標記，不刪除');

-- 擋下的情況
select throws_ok($$select private.import_dictionaries('{"version": "v3", "allergens": [], "ingredients": [], "dietaryRestrictions": []}')$$,
  '23503', null, 'ID 不能從字典檔消失');
select throws_ok($$select private.import_dictionaries('{"version": "v3",
  "allergens": [{"id": "crustacean", "name": {"zh-TW": "甲殼類"}}, {"id": "shrimp", "name": {"zh-TW": "蝦"}}],
  "ingredients": [
    {"id": "shrimp", "name": {"zh-TW": "蝦仁"}, "family": "shrimp-family", "category": "seafood", "defaultStorage": "freezer", "isPerishable": true, "allergenIds": ["mystery"]},
    {"id": "salt", "name": {"zh-TW": "鹽"}, "family": "salt-family", "category": "seasoning", "defaultStorage": "seasoning", "isPerishable": false}],
  "dietaryRestrictions": [{"id": "vegan", "name": {"zh-TW": "全素"}}]}')$$,
  '23503', null, '食材的過敏原要存在');
select throws_ok($$select private.import_dictionaries('{"version": "v3",
  "allergens": [{"id": "crustacean", "name": {"en": "Crustacean"}}, {"id": "shrimp", "name": {"zh-TW": "蝦"}}],
  "ingredients": [
    {"id": "shrimp", "name": {"zh-TW": "蝦仁"}, "family": "shrimp-family", "category": "seafood", "defaultStorage": "freezer", "isPerishable": true},
    {"id": "salt", "name": {"zh-TW": "鹽"}, "family": "salt-family", "category": "seasoning", "defaultStorage": "seasoning", "isPerishable": false}],
  "dietaryRestrictions": [{"id": "vegan", "name": {"zh-TW": "全素"}}]}')$$,
  '23514', null, '名稱一定要有繁中');

-- 權限
select tests.login_as(tests.create_user('reader@zhusha.test'));
select is((select count(*)::int from public.dict_ingredients), 2, '已登入的人可以讀字典');
select throws_ok($$insert into public.dict_allergens (id, name) values ('fake', '{"zh-TW": "假的"}')$$, '42501', null, 'App 不能寫字典');
select throws_ok($$select private.import_dictionaries('{"version": "x"}')$$, '42501', null, 'App 不能匯入字典');
select tests.logout();

select * from finish();
rollback;
