-- 口味資料：字典匯入的檢查、口味地圖與飲食限制的權限（13 第八節、16 第三、四、八節）
begin;
select plan(72);

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

-- 一份小而完整的字典，測試時用 `||` 換掉其中一段
create function tests.base_dict()
returns jsonb
language sql
as $json$
  select $j${
    "version": "t1",
    "allergens": [{ "id": "crustacean", "name": { "zh-TW": "甲殼類" } }],
    "ingredients": [{ "id": "salt", "name": { "zh-TW": "鹽" }, "family": "salt-family", "category": "seasoning",
      "defaultStorage": "seasoning", "isPerishable": false }],
    "dietaryRestrictions": [{ "id": "vegan", "name": { "zh-TW": "全素" }, "excludesTraits": ["animal"] }],
    "techniques": [{ "id": "pan-fry", "name": { "zh-TW": "煎" }, "group": "heat" }],
    "equipmentTypes": [],
    "regions": [{ "code": "TW", "name": { "zh-TW": "台灣" }, "hemisphere": "north", "defaultTimezone": "Asia/Taipei",
      "defaultLocale": "zh-TW", "defaultUnits": { "temperature": "C", "measure": "metric" },
      "seasons": [{ "key": "spring", "months": [3, 4, 5] }], "commonPantryIngredientIds": ["salt"], "dataStatus": "partial" },
      { "code": "US-CA", "name": { "zh-TW": "美國加州" }, "hemisphere": "north", "defaultTimezone": "America/Los_Angeles",
      "defaultLocale": "zh-TW", "defaultUnits": { "temperature": "F", "measure": "us" },
      "seasons": [], "dataStatus": "partial" }],
    "preferenceDimensions": [
      { "key": "cuisine.taiwan", "group": "cuisine", "name": { "zh-TW": "台灣" }, "impact": 0.9 },
      { "key": "taste.spicy", "group": "taste", "name": { "zh-TW": "辣" }, "impact": 0.8 },
      { "key": "spice_type.numbing_spicy", "group": "spice_type", "name": { "zh-TW": "麻辣" }, "parentKey": "taste.spicy", "impact": 0.5 }
    ],
    "quizItems": [
      { "id": "card_a", "type": "dish_card", "title": { "zh-TW": "麻婆豆腐" }, "description": { "zh-TW": "麻辣下飯" },
        "regions": ["TW"], "mapping": { "taste.spicy": 0.5 }, "excludedAllergenIds": ["crustacean"],
        "excludedRestrictionIds": ["vegan"], "followUps": ["card_b"] },
      { "id": "card_b", "type": "quick_fire", "title": { "zh-TW": "香菜" }, "regions": ["TW", "US-CA"], "mapping": { "taste.spicy": 1 } }
    ],
    "baseDishes": [
      { "id": "salt-egg", "name": { "zh-TW": "鹽煎蛋" }, "regions": ["TW"], "cuisineKeys": ["cuisine.taiwan"],
        "ingredientIds": ["salt"], "techniques": ["pan-fry"], "equipmentTypeIds": [],
        "difficulty": { "ingredients": 1, "equipment": 1, "time": 1, "technique": 2, "failureRisk": 3 } }
    ]
  }$j$::jsonb;
$json$;

delete from public.dict_base_dishes;
delete from public.dict_quiz_items;
delete from public.dict_preference_dimensions;
delete from public.dict_regions;
delete from public.dict_equipment_types;
delete from public.dict_techniques;
delete from public.dict_dietary_restrictions;
delete from public.dict_ingredients;
delete from public.dict_allergens;

select tests.create_user('owner@zhusha.test') as owner \gset
select tests.create_user('mate@zhusha.test') as mate \gset
select tests.create_user('stranger@zhusha.test') as stranger \gset
select tests.kitchen_of(:'owner') as k1 \gset
insert into public.kitchen_members (id, kitchen_id, user_id, role)
  values (private.uuid_v7(), :'k1', :'mate', 'member');

---------------------------------------------------------------------------
-- 字典匯入
---------------------------------------------------------------------------
select private.import_dictionaries(tests.base_dict());
select is((select count(*)::int from public.dict_preference_dimensions), 3, '匯入口味維度');
select is((select count(*)::int from public.dict_quiz_items), 2, '匯入題庫');
select is((select count(*)::int from public.dict_base_dishes), 1, '匯入基礎菜色');
select is((select count(*)::int from public.dict_regions), 2, '匯入地區（含美國加州）');
select is((select difficulty ->> 'failure_risk' from public.dict_base_dishes where id = 'salt-egg'), '3', '難易度存五個面向（failureRisk 轉成 failure_risk）');
select is((select parent_key from public.dict_preference_dimensions where key = 'spice_type.numbing_spicy'), 'taste.spicy', '維度的上層可以跨群組');
select is((select common_pantry_ingredient_ids from public.dict_regions where code = 'US-CA'), '{}'::text[], '地區沒有常見食材時是空的');
select private.import_dictionaries(tests.base_dict() || '{"version": "t2"}');
select is((select version from public.dict_version), 't2', '重新匯入會成功（整批取代）');

select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"quizItems": []}')$$, '23503', null, '題目的 ID 不能從字典檔消失');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"baseDishes": []}')$$, '23503', null, '菜色的 ID 不能從字典檔消失');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"preferenceDimensions": []}')$$, '23503', null, '維度的 key 不能從字典檔消失');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"regions": []}')$$, '23503', null, '地區的代碼不能從字典檔消失');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"quizItems": [
  {"id": "card_a", "type": "dish_card", "title": {"zh-TW": "甲"}, "regions": ["TW"], "mapping": {"taste.mystery": 0.5}},
  {"id": "card_b", "type": "quick_fire", "title": {"zh-TW": "乙"}, "regions": ["TW"]}]}')$$, '23503', null, '題目的 mapping 只能指向存在的維度');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"quizItems": [
  {"id": "card_a", "type": "dish_card", "title": {"zh-TW": "甲"}, "regions": ["JP"]},
  {"id": "card_b", "type": "quick_fire", "title": {"zh-TW": "乙"}, "regions": ["TW"]}]}')$$, '23503', null, '題目的地區要存在');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"quizItems": [
  {"id": "card_a", "type": "dish_card", "title": {"zh-TW": "甲"}, "regions": ["TW"], "followUps": ["card_x"]},
  {"id": "card_b", "type": "quick_fire", "title": {"zh-TW": "乙"}, "regions": ["TW"]}]}')$$, '23503', null, '後續題目要存在');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"quizItems": [
  {"id": "card_a", "type": "dish_card", "title": {"zh-TW": "甲"}, "regions": ["TW"], "excludedAllergenIds": ["mystery"]},
  {"id": "card_b", "type": "quick_fire", "title": {"zh-TW": "乙"}, "regions": ["TW"]}]}')$$, '23503', null, '排除的過敏原要存在');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"quizItems": [
  {"id": "card_a", "type": "dish_card", "title": {"zh-TW": "甲"}, "regions": ["TW"], "excludedRestrictionIds": ["mystery"]},
  {"id": "card_b", "type": "quick_fire", "title": {"zh-TW": "乙"}, "regions": ["TW"]}]}')$$, '23503', null, '排除的飲食限制要存在');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"baseDishes": [
  {"id": "salt-egg", "name": {"zh-TW": "鹽煎蛋"}, "cuisineKeys": ["cuisine.mystery"],
   "difficulty": {"ingredients": 1, "equipment": 1, "time": 1, "technique": 1, "failureRisk": 1}}]}')$$, '23503', null, '菜色的菜系要存在');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"baseDishes": [
  {"id": "salt-egg", "name": {"zh-TW": "鹽煎蛋"}, "ingredientIds": ["mystery"],
   "difficulty": {"ingredients": 1, "equipment": 1, "time": 1, "technique": 1, "failureRisk": 1}}]}')$$, '23503', null, '菜色的食材要存在');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"baseDishes": [
  {"id": "salt-egg", "name": {"zh-TW": "鹽煎蛋"}, "techniques": ["mystery"],
   "difficulty": {"ingredients": 1, "equipment": 1, "time": 1, "technique": 1, "failureRisk": 1}}]}')$$, '23503', null, '菜色的手法要存在');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"baseDishes": [
  {"id": "salt-egg", "name": {"zh-TW": "鹽煎蛋"}, "equipmentTypeIds": ["mystery"],
   "difficulty": {"ingredients": 1, "equipment": 1, "time": 1, "technique": 1, "failureRisk": 1}}]}')$$, '23503', null, '菜色的廚具要存在');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"baseDishes": [
  {"id": "salt-egg", "name": {"zh-TW": "鹽煎蛋"},
   "difficulty": {"ingredients": 1, "equipment": 1, "time": 1, "technique": 1, "failureRisk": 6}}]}')$$, '23514', null, '難易度要在 1–5');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"quizItems": [
  {"id": "card_a", "type": "dish_card", "title": {"zh-TW": "甲"}, "regions": ["TW"], "mapping": {"taste.spicy": 2}},
  {"id": "card_b", "type": "quick_fire", "title": {"zh-TW": "乙"}, "regions": ["TW"]}]}')$$, '23514', null, 'mapping 的值要在 −1～1');
-- 題庫格式（二選一、光譜、情境題）
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"quizItems": [
  {"id": "card_a", "type": "dish_card", "title": {"zh-TW": "甲"}, "regions": ["TW"], "mapping": {"taste.spicy": 0.5}},
  {"id": "card_b", "type": "quick_fire", "title": {"zh-TW": "乙"}, "regions": ["TW"], "mapping": {"taste.spicy": 1}},
  {"id": "tot_a", "type": "this_or_that", "title": {"zh-TW": "選一個"}, "regions": ["TW"],
   "options": [{"label": {"zh-TW": "辣"}, "mapping": {"taste.mystery": 0.8}}]}]}')$$, '23503', null, '二選一選項的 mapping 要指向存在的維度');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"quizItems": [
  {"id": "card_a", "type": "dish_card", "title": {"zh-TW": "甲"}, "regions": ["TW"], "mapping": {"taste.spicy": 0.5}},
  {"id": "card_b", "type": "quick_fire", "title": {"zh-TW": "乙"}, "regions": ["TW"], "mapping": {"taste.spicy": 1}},
  {"id": "spec_a", "type": "spectrum", "title": {"zh-TW": "多辣"}, "regions": ["TW"],
   "spectrum": {"dimension": "taste.mystery", "labels": [{"zh-TW": "1"}, {"zh-TW": "2"}, {"zh-TW": "3"}, {"zh-TW": "4"}, {"zh-TW": "5"}]}}]}')$$, '23503', null, '光譜的維度要存在');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"quizItems": [
  {"id": "card_a", "type": "dish_card", "title": {"zh-TW": "甲"}, "regions": ["TW"], "mapping": {"taste.spicy": 0.5}},
  {"id": "card_b", "type": "quick_fire", "title": {"zh-TW": "乙"}, "regions": ["TW"], "mapping": {"taste.spicy": 1}},
  {"id": "ctx_a", "type": "context", "title": {"zh-TW": "週末"}, "regions": ["TW"], "contextField": "adventure",
   "options": [{"label": {"zh-TW": "烤"}, "value": 0.4, "addGoal": "form.mystery"}]}]}')$$, '23503', null, '情境題「想學」的維度要存在');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"quizItems": [
  {"id": "card_a", "type": "dish_card", "title": {"zh-TW": "甲"}, "regions": ["TW"], "mapping": {"taste.spicy": 0.5}},
  {"id": "card_b", "type": "quick_fire", "title": {"zh-TW": "乙"}, "regions": ["TW"], "mapping": {"taste.spicy": 1}},
  {"id": "spec_a", "type": "spectrum", "title": {"zh-TW": "多辣"}, "regions": ["TW"],
   "spectrum": {"dimension": "taste.spicy", "labels": [{"zh-TW": "1"}, {"zh-TW": "2"}]}}]}')$$, '23514', null, '光譜要有五個點');
select throws_ok($$insert into public.dict_quiz_items (id, item_type, title, context_field) values ('ctx_x', 'context', '{"zh-TW": "壞"}', 'mystery')$$, '23514', null, '情境題的欄位只能是三種之一');
select private.import_dictionaries(tests.base_dict() || '{"quizItems": [
  {"id": "card_a", "type": "dish_card", "title": {"zh-TW": "甲"}, "regions": ["TW"], "mapping": {"taste.spicy": 0.5}},
  {"id": "card_b", "type": "quick_fire", "title": {"zh-TW": "乙"}, "regions": ["TW"], "mapping": {"taste.spicy": 1}},
  {"id": "tot_a", "type": "this_or_that", "title": {"zh-TW": "選一個"}, "regions": ["TW"],
   "options": [{"label": {"zh-TW": "辣"}, "mapping": {"taste.spicy": 0.8}}, {"label": {"zh-TW": "不辣"}, "mapping": {"taste.spicy": -0.8}}]},
  {"id": "spec_a", "type": "spectrum", "title": {"zh-TW": "多辣"}, "regions": ["TW"],
   "spectrum": {"dimension": "taste.spicy", "labels": [{"zh-TW": "1"}, {"zh-TW": "2"}, {"zh-TW": "3"}, {"zh-TW": "4"}, {"zh-TW": "5"}]}},
  {"id": "ctx_a", "type": "context", "title": {"zh-TW": "週末"}, "regions": ["TW"], "contextField": "adventure",
   "options": [{"label": {"zh-TW": "烤"}, "value": 0.4, "addGoal": "taste.spicy"}]}]}');
select is((select options -> 0 -> 'mapping' ->> 'taste.spicy' from public.dict_quiz_items where id = 'tot_a'), '0.8', '二選一的選項存進 options');
select is((select spectrum ->> 'dimension' from public.dict_quiz_items where id = 'spec_a'), 'taste.spicy', '光譜存進 spectrum');
select is((select context_field from public.dict_quiz_items where id = 'ctx_a'), 'adventure', '情境題的欄位存進 context_field');
select is((select options is null and spectrum is null and context_field is null from public.dict_quiz_items where id = 'card_a'), true, '菜卡沒有這三個欄位');
delete from public.dict_quiz_items where id in ('tot_a', 'spec_a', 'ctx_a');

select throws_ok($$insert into public.dict_quiz_items (id, item_type, title) values ('Card-A', 'dish_card', '{"zh-TW": "甲"}')$$, '23514', null, '題目 ID 的格式');
select throws_ok($$select private.import_dictionaries(tests.base_dict() || '{"preferenceDimensions": [
  {"key": "cuisine.taiwan", "group": "taste", "name": {"zh-TW": "台灣"}, "impact": 0.9},
  {"key": "taste.spicy", "group": "taste", "name": {"zh-TW": "辣"}, "impact": 0.8},
  {"key": "spice_type.numbing_spicy", "group": "spice_type", "name": {"zh-TW": "麻辣"}, "impact": 0.5}]}')$$, '23514', null, '維度的群組要和 key 的第一段一致');
select throws_ok($$insert into public.dict_preference_dimensions (key, dimension_group, name, impact) values ('Cuisine.Taiwan', 'cuisine', '{"zh-TW": "台灣"}', 0.9)$$, '23514', null, '維度 key 的格式');
select throws_ok($$insert into public.dict_regions (code, name, hemisphere, default_timezone, default_locale, default_units, seasons, data_status)
  values ('tw', '{"zh-TW": "台灣"}', 'north', 'Asia/Taipei', 'zh-TW', '{"temperature": "C", "measure": "metric"}', '[]', 'partial')$$, '23514', null, '地區代碼的格式');

-- 字典：已登入的人可以讀、不能寫
select tests.login_as(:'owner');
select is((select count(*)::int from public.dict_preference_dimensions), 3, '已登入的人讀得到口味維度');
select throws_ok($$insert into public.dict_quiz_items (id, item_type, title) values ('card_x', 'dish_card', '{"zh-TW": "壞"}')$$, '42501', null, 'App 不能寫題庫');
select tests.logout();

---------------------------------------------------------------------------
-- 地區代碼：廚房可以用 US-CA、JP，格式不對的擋下
---------------------------------------------------------------------------
select tests.login_as(:'owner');
select is(tests.updated_rows(format($$update public.kitchens set region = 'US-CA' where id = '%s'$$, :'k1')), 1, '廚房可以改成美國加州');
select throws_ok(format($$update public.kitchens set region = 'us-ca' where id = '%s'$$, :'k1'), '23514', null, '地區代碼要大寫');
select throws_ok(format($$update public.kitchens set region = 'USA' where id = '%s'$$, :'k1'), '23514', null, '國家代碼只能兩個字母');
select tests.logout();

---------------------------------------------------------------------------
-- 註冊時建立空的口味地圖與飲食限制
---------------------------------------------------------------------------
select is((select count(*)::int from public.preference_profiles where user_id = :'owner'), 1, '註冊時建了口味地圖');
select is((select count(*)::int from public.dietary_profiles where user_id = :'owner'), 1, '註冊時建了飲食限制');
select is((select dims from public.preference_profiles where user_id = :'owner'), '{}'::jsonb, '口味地圖一開始是空的');
select public.setup_new_user(:'owner'::uuid);
select is((select count(*)::int from public.preference_profiles where user_id = :'owner'), 1, '重複呼叫不會產生第二份口味地圖');
select is((select count(*)::int from public.dietary_profiles where user_id = :'owner'), 1, '重複呼叫不會產生第二份飲食限制');

---------------------------------------------------------------------------
-- 口味地圖：只有本人
---------------------------------------------------------------------------
select tests.login_as(:'owner');
select is(tests.updated_rows($$update public.preference_profiles set
  dims = '{"taste.spicy": {"affinity": 0.8, "confidence": 0.6, "source": "explored", "updated_at": "2026-11-20T00:00:00Z"}}',
  context = '{"adventure": 0.4, "goals": ["甜點麵包"], "festive_dishes": true, "time_preference": "quick"}',
  answered_item_ids = '{card_a}', card_title = '香辣台式派', last_explored_at = now()$$), 1, '本人可以改自己的口味地圖');
select is((select (dims -> 'taste.spicy' ->> 'affinity')::numeric from public.preference_profiles), 0.8, '存進去的維度讀得回來');
select is((select count(*)::int from public.preference_profiles), 1, '只看得到自己的');
select throws_ok($$update public.preference_profiles set dims = '{"taste.mystery": {"affinity": 0.8, "confidence": 0.6, "source": "explored", "updated_at": "x"}}'$$,
  '23514', null, '維度 key 要在字典裡');
select throws_ok($$update public.preference_profiles set dims = '{"taste.spicy": {"affinity": 2, "confidence": 0.6, "source": "explored", "updated_at": "x"}}'$$,
  '23514', null, '喜好程度要在 −1～1');
select throws_ok($$update public.preference_profiles set dims = '{"taste.spicy": {"affinity": 1, "confidence": 0.6, "source": "guess", "updated_at": "x"}}'$$,
  '23514', null, '來源只能是 user_set、explored、learned');
select throws_ok($$update public.preference_profiles set context = '{"adventure": 3, "goals": [], "festive_dishes": false}'$$,
  '23514', null, '挑戰意願要在 0–1');
select throws_ok(format($$update public.preference_profiles set user_id = '%s'$$, :'mate'), '42501', null, '不能改擁有者');
select tests.logout();

select tests.login_as(:'mate');
select is((select count(*)::int from public.preference_profiles where user_id = :'owner'), 0, '同廚房的家人也讀不到');
select is(tests.updated_rows(format($$update public.preference_profiles set card_title = '被改了' where user_id = '%s'$$, :'owner')), 0, '改不到別人的');
select is(tests.updated_rows(format($$delete from public.preference_profiles where user_id = '%s'$$, :'owner')), 0, '刪不掉別人的');
select tests.logout();

select tests.login_as(:'stranger');
select is((select count(*)::int from public.preference_profiles where user_id = :'owner'), 0, '外人讀不到');
select tests.logout();

---------------------------------------------------------------------------
-- 飲食限制：本人；同廚房而且本人願意分享的家人可以讀
---------------------------------------------------------------------------
select tests.login_as(:'owner');
select is(tests.updated_rows($$update public.dietary_profiles set allergen_ids = '{crustacean}', dislike_ingredient_ids = '{salt}',
  dietary_restriction_ids = '{vegan}', no_cooking_alcohol = true,
  recurring_rules = '[{"restriction_id": "vegan", "schedule": "lunar_1_15"}]'$$), 1, '本人可以改自己的飲食限制');
select throws_ok($$update public.dietary_profiles set allergen_ids = '{mystery}'$$, '23514', null, '過敏原要在字典裡');
select throws_ok($$update public.dietary_profiles set dislike_ingredient_ids = '{mystery}'$$, '23514', null, '不吃的食材要在字典裡');
select throws_ok($$update public.dietary_profiles set dietary_restriction_ids = '{mystery}'$$, '23514', null, '飲食限制要在字典裡');
select throws_ok($$update public.dietary_profiles set recurring_rules = '[{"restriction_id": "mystery", "schedule": "weekly"}]'$$, '23514', null, '週期性規則的限制要在字典裡');
select throws_ok($$update public.dietary_profiles set recurring_rules = '[{"restriction_id": "vegan", "schedule": "daily"}]'$$, '23514', null, '週期性規則的週期只有三種');
select throws_ok(format($$insert into public.dietary_profiles (id, user_id) values ('%s', '%s')$$, private.uuid_v7(), :'owner'), '23505', null, '一個人只有一份');
select throws_ok(format($$insert into public.dietary_profiles (id, user_id) values ('%s', '%s')$$, private.uuid_v7(), :'mate'), '42501', null, '不能幫別人建');
select tests.logout();

select tests.login_as(:'mate');
select is((select count(*)::int from public.dietary_profiles where user_id = :'owner'), 1, '同廚房的家人在本人預設分享時讀得到');
select is(tests.updated_rows(format($$update public.dietary_profiles set allergen_ids = '{}' where user_id = '%s'$$, :'owner')), 0, '家人不能改');
select tests.logout();

select tests.login_as(:'stranger');
select is((select count(*)::int from public.dietary_profiles where user_id = :'owner'), 0, '外人讀不到');
select tests.logout();

select tests.login_as(:'owner');
update public.kitchen_members set share_dietary_info = false where user_id = :'owner';
select tests.logout();
select tests.login_as(:'mate');
select is((select count(*)::int from public.dietary_profiles where user_id = :'owner'), 0, '本人關掉分享後，家人讀不到');
select tests.logout();

---------------------------------------------------------------------------
-- 停用的帳號不能寫
---------------------------------------------------------------------------
update public.user_profiles set status = 'suspended' where user_id = :'owner';
select tests.login_as(:'owner');
select throws_ok($$update public.preference_profiles set card_title = '停用中'$$, '42501', null, '停用中不能改口味地圖');
select throws_ok($$update public.dietary_profiles set no_cooking_alcohol = false$$, '42501', null, '停用中不能改飲食限制');
select tests.logout();

select * from finish();
rollback;
