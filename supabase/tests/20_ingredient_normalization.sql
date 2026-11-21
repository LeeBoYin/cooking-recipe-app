-- 食材正規化（M1a-05）：對應表與背景任務的權限、對應的優先順序、排隊與去重、完成後的回填、使用者手動修正、重試
begin;
select plan(55);

create function tests.save(p jsonb)
returns public.recipes
language plpgsql
as $$
declare
  v_updated timestamptz;
begin
  select updated_at into v_updated from public.recipes where id = (p->>'id')::uuid;
  return public.save_recipe(p, v_updated);
end;
$$;
grant execute on function tests.save(jsonb) to authenticated;

select tests.create_user('alice@zhusha.test') as alice \gset
select tests.create_user('bob@zhusha.test') as bob \gset
select tests.kitchen_of(:'alice') as ka \gset
select tests.kitchen_of(:'bob') as kb \gset

insert into public.dict_ingredients (id, name, aliases, family, category, default_storage, is_perishable)
  values ('nt-chili', '{"zh-TW": "測試辣椒"}', '{"zh-TW": []}', 'nt-chili-family', 'vegetable', 'fridge', true),
         ('nt-pepper', '{"zh-TW": "測試胡椒"}', '{"zh-TW": []}', 'nt-pepper-family', 'spice', 'seasoning', false),
         ('nt-old', '{"zh-TW": "舊測試"}', '{"zh-TW": []}', 'nt-old-family', 'spice', 'seasoning', false);
update public.dict_ingredients set deprecated = true, replaced_by = 'nt-pepper' where id = 'nt-old';

select private.uuid_v7() as p1 \gset
select private.uuid_v7() as p2 \gset
select private.uuid_v7() as p3 \gset
select private.uuid_v7() as p4 \gset
select private.uuid_v7() as p5 \gset
select private.uuid_v7() as p6 \gset
select private.uuid_v7() as r1 \gset
select private.uuid_v7() as r2 \gset

---------------------------------------------------------------------------
-- 一、標準寫法與權限
---------------------------------------------------------------------------
select is(private.normalize_term('  Ａ１ 辣 椒  '), 'a1辣椒', '標準寫法：全形轉半形、小寫、去空白');

select tests.login_as(:'alice');
select throws_ok($$select * from public.background_jobs$$, '42501', null, '使用者讀不到背景任務');
select throws_ok($$select * from public.ingredient_mappings$$, '42501', null, '使用者讀不到全站對應');
select throws_ok($$insert into public.user_ingredient_mappings (user_id, raw_text_normalized, ingredient_id) values (auth.uid(), 'x', 'nt-chili')$$,
  '42501', null, '使用者不能直接寫自己的對應表');
select throws_ok($$select public.claim_background_jobs('normalize_ingredients')$$, '42501', null, '使用者不能領背景任務');
select throws_ok($$select private.enqueue_normalization(auth.uid(), 'x')$$, '42501', null, '使用者不能直接排隊');

---------------------------------------------------------------------------
-- 二、add_pantry_items：對不到的詞保留原文並排隊，同一個詞只排一次
---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.add_pantry_items(:'ka', jsonb_build_array(
    jsonb_build_object('id', :'p1', 'raw_name', '小朝天椒'),
    jsonb_build_object('id', :'p2', 'raw_name', '123')))),
  2, '加入兩樣');
select is((select ingredient_id from public.pantry_items where id = :'p1'), null, '對不到的食材先保留原文（沒有 ingredient_id）');

select tests.logout();
select is((select count(*)::int from public.background_jobs where status = 'pending'), 1, '只有字典與對應都對不到、又不是純數字的詞才排隊');
select is((select dedupe_key from public.background_jobs), '小朝天椒', '任務的鍵是標準寫法');
select is((select requested_by from public.background_jobs), :'alice'::uuid, '記下第一個排隊的人');

select tests.login_as(:'bob');
select public.add_pantry_items(:'kb', jsonb_build_array(jsonb_build_object('id', :'p3', 'raw_name', ' 小朝天 椒 ')));
select tests.logout();
select is((select count(*)::int from public.background_jobs where status = 'pending'), 1, '別人輸入同一個詞（空白不同）不會重複排隊');

---------------------------------------------------------------------------
-- 三、食譜食材：name 欄位、排隊
---------------------------------------------------------------------------
select tests.login_as(:'alice');
select lives_ok(format($$select tests.save('{"id":"%s","ingredients":[
  {"id":"a","raw_text":"小朝天椒 3 根","name":"小朝天椒","amount":3,"unit":"stalk","optional":false},
  {"id":"b","raw_text":"神祕香料 1 匙","name":"神祕香料","amount":1,"unit":"tsp","optional":false}]}')$$, :'r1'), '存帶 name 的食材');
select is((select ingredients->0->>'ingredient_id' from public.recipes where id = :'r1'), null, '對不到的食材列沒有 ingredient_id');
select throws_ok(format($$select tests.save('{"id":"%s","ingredients":[{"id":"a","raw_text":"x","name":"","optional":false}]}')$$, :'r2'),
  null, null, 'name 不能是空字串');
select tests.logout();
select is((select count(*)::int from public.background_jobs where status = 'pending'), 2, '食譜裡對不到的詞也排隊（小朝天椒已經在佇列，只多神祕香料）');
select tests.create_user('carol@zhusha.test') as carol \gset

---------------------------------------------------------------------------
-- 四、背景函式：領任務、回報、回填
---------------------------------------------------------------------------
set local role service_role;
select is(jsonb_array_length(public.claim_background_jobs('normalize_ingredients', 10)), 2, '領到兩個任務');
select is((select count(*)::int from public.background_jobs where status = 'running' and attempts = 1), 2, '領了之後是執行中、次數 1');
select is(jsonb_array_length(public.claim_background_jobs('normalize_ingredients', 10)), 0, '執行中的不會被重複領');
reset role;

select updated_at as r1_updated from public.recipes where id = :'r1' \gset
select id as job_chili from public.background_jobs where dedupe_key = '小朝天椒' \gset
select id as job_mystery from public.background_jobs where dedupe_key = '神祕香料' \gset

set local role service_role;
select is(public.complete_normalization_jobs(jsonb_build_array(
  jsonb_build_object('id', :'job_chili', 'ingredient_id', 'nt-chili', 'model', 'claude-haiku-5-5'),
  jsonb_build_object('id', :'job_mystery', 'ingredient_id', null, 'model', 'claude-haiku-5-5'))), 2, '回報兩個任務');
reset role;

select is((select ingredient_id from public.ingredient_mappings where raw_text_normalized = '小朝天椒'), 'nt-chili', '全站對應寫入');
select is((select ingredient_id is null from public.ingredient_mappings where raw_text_normalized = '神祕香料'), true, '「沒有合適的」也記下來（不再重問）');
select is((select count(*)::int from public.background_jobs where status = 'done'), 2, '任務完成');
select is((select ingredient_id from public.pantry_items where id = :'p1'), 'nt-chili', '回填：Alice 的食材');
select is((select ingredient_id from public.pantry_items where id = :'p3'), 'nt-chili', '回填：Bob 的食材');
select is((select raw_name from public.pantry_items where id = :'p1'), '小朝天椒', '食材原文沒變');
select is((select ingredients->0->>'ingredient_id' from public.recipes where id = :'r1'), 'nt-chili', '回填：食譜食材');
select is((select ingredients->0->>'raw_text' from public.recipes where id = :'r1'), '小朝天椒 3 根', '食譜原文沒變');
select is((select ingredient_ids from public.recipes where id = :'r1'), array['nt-chili'], '食譜的食材 ID 清單重算');
select is((select updated_at from public.recipes where id = :'r1'), :'r1_updated'::timestamptz, '回填不改食譜的 updated_at');

---------------------------------------------------------------------------
-- 五、之後的輸入直接對到全站對應；已經問過沒有的不再排隊
---------------------------------------------------------------------------
select tests.login_as(:'bob');
select is((select ingredient_id from public.add_pantry_items(:'kb', jsonb_build_array(jsonb_build_object('id', :'p4', 'raw_name', '小朝天椒')))),
  'nt-chili', '輸入同一個詞時直接用全站對應');
select public.add_pantry_items(:'kb', jsonb_build_array(jsonb_build_object('id', :'p5', 'raw_name', '神祕香料')));
select tests.logout();
select is((select count(*)::int from public.background_jobs where status in ('pending', 'running')), 0, '已經有對應（含「沒有合適的」）就不再排隊');

---------------------------------------------------------------------------
-- 六、使用者自己的對應優先，而且只影響自己
---------------------------------------------------------------------------
select tests.login_as(:'alice');
select throws_ok($$select public.set_my_ingredient_mapping('小朝天椒', 'no-such-id')$$, '22023', 'unknown_ingredient', '不能對應到字典沒有的食材');
select throws_ok($$select public.set_my_ingredient_mapping('小朝天椒', 'nt-old')$$, '22023', 'unknown_ingredient', '不能對應到已淘汰的食材');
select lives_ok($$select public.set_my_ingredient_mapping('小朝天椒', 'nt-pepper')$$, 'Alice 把「小朝天椒」改成胡椒');
select is((select ingredient_id from public.pantry_items where id = :'p1'), 'nt-pepper', '自己的食材改了');
select is((select ingredients->0->>'ingredient_id' from public.recipes where id = :'r1'), 'nt-pepper', '自己的食譜食材改了');
select is((select count(*)::int from public.user_ingredient_mappings), 1, 'Alice 看得到自己的對應');
select tests.logout();
select is((select ingredient_id from public.pantry_items where id = :'p3'), 'nt-chili', 'Bob 的食材沒被改');
select is((select ingredient_id from public.ingredient_mappings where raw_text_normalized = '小朝天椒'), 'nt-chili', '全站對應沒被改');

select tests.login_as(:'alice');
select is((select ingredient_id from public.add_pantry_items(:'ka', jsonb_build_array(
  jsonb_build_object('id', :'p6', 'raw_name', '小朝天椒', 'ingredient_id', 'nt-chili')))), 'nt-pepper',
  '使用者自己的對應優先於手機送來的 ingredient_id');
select lives_ok(format($$select tests.save('{"id":"%s","ingredients":[
  {"id":"a","raw_text":"小朝天椒 5 根","name":"小朝天椒","ingredient_id":"nt-chili","optional":false}]}')$$, :'r2'), 'Alice 存新食譜');
select is((select ingredients->0->>'ingredient_id' from public.recipes where id = :'r2'), 'nt-pepper', '存食譜時，使用者自己的對應優先');
select lives_ok($$select public.clear_my_ingredient_mapping('小朝天椒')$$, '拿掉自己的修正');
select is((select count(*)::int from public.user_ingredient_mappings), 0, '修正已移除');
select tests.logout();

---------------------------------------------------------------------------
-- 七、全站對應的回填不蓋掉使用者自己的修正；已淘汰的 ID 換成取代的
---------------------------------------------------------------------------
select tests.login_as(:'alice');
select public.set_my_ingredient_mapping('胡亂椒', 'nt-chili');
select public.add_pantry_items(:'ka', jsonb_build_array(jsonb_build_object('id', private.uuid_v7(), 'raw_name', '胡亂椒')));
select tests.logout();
select private.apply_ingredient_mapping('胡亂椒', 'nt-pepper', null);
select is((select ingredient_id from public.pantry_items where raw_name = '胡亂椒' and created_by = :'alice'), 'nt-chili',
  '全站回填略過自己有對應的人');
insert into public.ingredient_mappings (raw_text_normalized, ingredient_id, source) values ('老胡椒', 'nt-old', 'admin');
select is(private.global_ingredient_mapping('老胡椒'), 'nt-pepper', '對應到已淘汰的 ID 時換成取代它的');

---------------------------------------------------------------------------
-- 八、重試：退避、次數上限、放回佇列
---------------------------------------------------------------------------
select private.enqueue_normalization(:'alice', '怪怪的詞');
set local role service_role;
select public.claim_background_jobs('normalize_ingredients', 5);
reset role;
select id as job_x from public.background_jobs where dedupe_key = '怪怪的詞' \gset
set local role service_role;
select public.fail_background_job(:'job_x', 'upstream_error');
reset role;
select is((select status from public.background_jobs where id = :'job_x'), 'pending', '失敗後還有次數：放回佇列');
select ok((select run_after > now() + interval '1 minute' from public.background_jobs where id = :'job_x'), '退避：晚一點再試');
update public.background_jobs set run_after = now() where id = :'job_x';
set local role service_role;
select public.claim_background_jobs('normalize_ingredients', 5);
select public.release_background_jobs(array[:'job_x'::uuid], 0);
reset role;
select is((select attempts::int from public.background_jobs where id = :'job_x'), 1, '放回佇列不算一次嘗試');
update public.background_jobs set attempts = max_attempts, status = 'running' where id = :'job_x';
set local role service_role;
select public.fail_background_job(:'job_x', 'upstream_error');
reset role;
select is((select status from public.background_jobs where id = :'job_x'), 'dead', '次數用完就放棄');
select private.enqueue_normalization(:'alice', '怪怪的詞');
select is((select count(*)::int from public.background_jobs where dedupe_key = '怪怪的詞' and status = 'pending'), 0, '剛放棄的詞 7 天內不再排隊');

---------------------------------------------------------------------------
-- 九、預算用完、AI 關閉時不排隊
---------------------------------------------------------------------------
update public.app_config set ai_monthly_budget_usd = 0 where id;
select private.enqueue_normalization(:'alice', '預算詞');
select is((select count(*)::int from public.background_jobs where dedupe_key = '預算詞'), 0, '預算用完時不排隊');
update public.app_config set ai_monthly_budget_usd = 100 where id;
update public.app_config set ai_enabled = false where id;
select private.enqueue_normalization(:'alice', '預算詞');
select is((select count(*)::int from public.background_jobs where dedupe_key = '預算詞'), 0, 'AI 總開關關閉時不排隊');
update public.app_config set ai_enabled = true where id;
select private.enqueue_normalization(:'alice', '預算詞');
select is((select count(*)::int from public.background_jobs where dedupe_key = '預算詞'), 1, '恢復後可以排隊');

select * from finish();
rollback;
