-- 食材存檔時解析（M0-21b）：save_recipe 檢查手機送來的 ingredient_id、amount、amount_max、unit，
-- 不合格的欄位清空、保留原文；舊食譜的回填函式只給 service_role
begin;
select plan(15);

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

select tests.create_user('owner@zhusha.test') as owner \gset
select id as d1 from public.dict_ingredients order by id limit 1 \gset
select private.uuid_v7() as r1 \gset

select tests.login_as(:'owner');

select lives_ok(format($$select tests.save('{"id":"%s","ingredients":[
  {"id":"a","raw_text":"蒜 2–3 瓣","ingredient_id":"%s","amount":2,"amount_max":3,"unit":"clove","optional":false},
  {"id":"b","raw_text":"鹽 適量","unit":"to_taste","optional":false},
  {"id":"c","raw_text":"醬油 2 大匙","amount":2,"unit":"tbsp","optional":false}
 ]}')$$, :'r1', :'d1'), '存解析好的食材');
select is((select ingredients->0 from public.recipes where id = :'r1'),
  format('{"id":"a","raw_text":"蒜 2–3 瓣","ingredient_id":"%s","amount":2,"amount_max":3,"unit":"clove","optional":false}', :'d1')::jsonb,
  '合格的欄位原樣存下');
select is((select ingredients->1 from public.recipes where id = :'r1'),
  '{"id":"b","raw_text":"鹽 適量","unit":"to_taste","optional":false}'::jsonb, '適量只有單位、沒有數量');
select is((select ingredient_ids from public.recipes where id = :'r1'), array[:'d1'], '食材 ID 由字典算出');

select tests.save(format('{"id":"%s","ingredients":[
  {"id":"a","raw_text":"神秘醬 1 匙","ingredient_id":"not-in-dictionary","amount":1,"unit":"spoon","optional":false}]}', :'r1')::jsonb);
select is((select ingredients->0 from public.recipes where id = :'r1'),
  '{"id":"a","raw_text":"神秘醬 1 匙","amount":1,"optional":false}'::jsonb, '字典沒有的食材 ID、清單沒有的單位被清空，其餘保留');

select tests.save(format('{"id":"%s","ingredients":[
  {"id":"a","raw_text":"x 0 克","amount":0,"unit":"g","optional":false},
  {"id":"b","raw_text":"y -2 克","amount":-2,"unit":"g","optional":false}]}', :'r1')::jsonb);
select is((select ingredients->0 from public.recipes where id = :'r1'),
  '{"id":"a","raw_text":"x 0 克","unit":"g","optional":false}'::jsonb, '數量要是正數：0 被清空');
select is((select ingredients->1->'amount' from public.recipes where id = :'r1'), null, '數量要是正數：負數被清空');

select tests.save(format('{"id":"%s","ingredients":[
  {"id":"a","raw_text":"蒜 3-2 瓣","amount":3,"amount_max":2,"unit":"clove","optional":false},
  {"id":"b","raw_text":"蒜 2-3 瓣","amount_max":3,"unit":"clove","optional":false},
  {"id":"c","raw_text":"蒜 2-2 瓣","amount":2,"amount_max":2,"unit":"clove","optional":false}]}', :'r1')::jsonb);
select is((select ingredients->0 from public.recipes where id = :'r1'),
  '{"id":"a","raw_text":"蒜 3-2 瓣","amount":3,"unit":"clove","optional":false}'::jsonb, '上限小於下限：只清空上限');
select is((select ingredients->1->'amount_max' from public.recipes where id = :'r1'), null, '沒有數量就不能有上限');
select is((select ingredients->2->>'amount_max' from public.recipes where id = :'r1'), '2', '上限等於下限可以');

select tests.save(format('{"id":"%s","ingredients":[
  {"id":"a","raw_text":"鹽 1 克","amount":"1","unit":5,"ingredient_id":7,"optional":false}]}', :'r1')::jsonb);
select is((select ingredients->0 from public.recipes where id = :'r1'),
  '{"id":"a","raw_text":"鹽 1 克","optional":false}'::jsonb, '型別不對的欄位也清空');

select throws_ok(format($$select tests.save('{"id":"%s","ingredients":["abc"]}')$$, :'r1'), null, null, '不是物件的項目照舊被格式檢查拒絕');

-- 舊食譜的回填：只有 service_role
select throws_ok(format($$select public.backfill_recipe_ingredients('%s', '[]')$$, :'r1'), '42501', null, '一般使用者不能回填');
reset role;
select is(
  public.backfill_recipe_ingredients(:'r1', format('[{"id":"a","raw_text":"鹽 1 克","amount":1,"unit":"g","optional":false}]')::jsonb),
  true, '原文沒變時回填');
select is(
  public.backfill_recipe_ingredients(:'r1', '[{"id":"z","raw_text":"別的","amount":1,"unit":"g","optional":false}]'::jsonb),
  false, '原文變了（作者剛改過）不回填');

select * from finish();
rollback;
