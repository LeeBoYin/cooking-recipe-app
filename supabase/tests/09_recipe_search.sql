-- 我的食譜的搜尋：名稱與食材原文、只找自己已發佈未刪除的
begin;
select plan(11);

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
select tests.create_user('other@zhusha.test') as other \gset
select private.uuid_v7() as r1 \gset
select private.uuid_v7() as r2 \gset
select private.uuid_v7() as r3 \gset
select private.uuid_v7() as r4 \gset
select private.uuid_v7() as r5 \gset

select tests.login_as(:'owner');
select tests.save(format('{"id":"%s","title":"麻婆豆腐","ingredients":[{"id":"i1","raw_text":"板豆腐 1 盒","optional":false}]}', :'r1')::jsonb);
select tests.save(format('{"id":"%s","title":"三杯雞","ingredients":[{"id":"i1","raw_text":"雞腿肉 500 克","optional":false},{"id":"i2","raw_text":"嫩豆腐 半盒","optional":false}]}', :'r2')::jsonb);
select tests.save(format('{"id":"%s","title":"草稿豆腐"}', :'r3')::jsonb);
select tests.save(jsonb_build_object('id', :'r4'::text, 'title', '100% 純果汁'));
select tests.save(format('{"id":"%s","title":"已刪除的豆腐"}', :'r5')::jsonb);
select public.publish_recipe(:'r1'::uuid);
select public.publish_recipe(:'r2'::uuid);
select public.publish_recipe(:'r4'::uuid);
select public.publish_recipe(:'r5'::uuid);
select public.delete_recipe(:'r5'::uuid);

select is((select count(*)::int from public.search_my_recipes('豆腐')), 2, '名稱或食材符合的兩篇；草稿與已刪除的不算');
select is((select match_kind from public.search_my_recipes('豆腐') where recipe_id = :'r1'), 'title', '名稱符合');
select is((select match_kind from public.search_my_recipes('豆腐') where recipe_id = :'r2'), 'ingredient', '食材符合');
select is((select match_text from public.search_my_recipes('豆腐') where recipe_id = :'r2'), '嫩豆腐 半盒', '回傳符合的食材原文');
select is((select count(*)::int from public.search_my_recipes('  豆腐  ')), 2, '前後空白不影響');
select is((select count(*)::int from public.search_my_recipes('')), 0, '空的關鍵字不回傳');
select is((select count(*)::int from public.search_my_recipes('%')), 1, '% 當成一般字元，只找到有 % 的');
select is((select count(*)::int from public.search_my_recipes('_')), 0, '_ 不是萬用字元');
select is((select count(*)::int from public.search_my_recipes('三杯')), 1, '名稱的一部分');
select tests.logout();

select tests.login_as(:'other');
select is((select count(*)::int from public.search_my_recipes('豆腐')), 0, '別人找不到我的食譜');
select tests.logout();

select tests.logout();
select throws_ok($$set local role anon; select * from public.search_my_recipes('豆腐')$$, '42501', null, '沒登入不能用');

select * from finish();
rollback;
