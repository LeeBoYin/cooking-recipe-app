-- 收藏大廚的點子：只有本人、同一道只收一筆、主要食材由字典算、取消收藏、連到自己的食譜
begin;
select plan(17);

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
select id as d1 from public.dict_base_dishes order by id limit 1 \gset
select id as d2 from public.dict_base_dishes order by id offset 1 limit 1 \gset
select private.uuid_v7() as b1 \gset
select private.uuid_v7() as b1b \gset
select private.uuid_v7() as b2 \gset
select private.uuid_v7() as r1 \gset
select private.uuid_v7() as r2 \gset

select tests.login_as(:'owner');
select lives_ok(format($$select public.bookmark_recipe('%s', '測試菜', '你愛這味', '%s')$$, :'b1', :'d1'), '本人可以收藏大廚的點子');
select is((select count(*)::int from public.bookmarks), 1, '讀得到自己的收藏');
select is((select idea ->> 'title' from public.bookmarks where id = :'b1'), '測試菜', '存下菜名快照');
select is((select idea ->> 'baseDishId' from public.bookmarks where id = :'b1'), :'d1', '快照記 baseDishId');
select ok(
  (select idea_ingredient_ids from public.bookmarks where id = :'b1')
    = (select coalesce(array_agg(u.id order by u.ord), '{}')
       from public.dict_base_dishes d,
         unnest(d.ingredient_ids) with ordinality u(id, ord)
         left join public.dict_ingredients i on i.id = u.id
       where d.id = :'d1' and (i.category is null or i.category not in ('seasoning', 'sauce', 'spice', 'oil'))),
  '主要食材由家常菜算出，不含調味');
select is((select (public.bookmark_recipe(:'b1b', '別的名字', null, :'d1')).id), :'b1'::uuid, '同一道再收藏回傳既有那筆');
select is((select count(*)::int from public.bookmarks), 1, '同一道只有一筆');
select throws_ok(format($$select public.bookmark_recipe('%s', 'x', null, 'no-such-dish')$$, :'b2'),
  '23503', null, '不存在的家常菜不能收藏');
select throws_ok(format($$insert into public.bookmarks (id, user_id, kind, idea) values ('%s', '%s', 'chef_idea', '{}')$$, :'b2', :'owner'),
  '42501', null, '不能直接新增（只經 bookmark_recipe）');

-- 連到自己的食譜
select tests.save(format('{"id":"%s","title":"我的版本"}', :'r1')::jsonb);
select lives_ok(format($$update public.bookmarks set cooked_recipe_id = '%s' where id = '%s'$$, :'r1', :'b1'), '可以連到自己的食譜');
select tests.logout();

select tests.login_as(:'other');
select tests.save(format('{"id":"%s","title":"別人的"}', :'r2')::jsonb);
select is((select count(*)::int from public.bookmarks), 0, '讀不到別人的收藏');
select lives_ok(format($$select public.bookmark_recipe('%s', '別人收藏', null, '%s')$$, :'b2', :'d1'), '別人可以收藏同一道');
select tests.logout();

select tests.login_as(:'owner');
select throws_ok(format($$update public.bookmarks set cooked_recipe_id = '%s' where id = '%s'$$, :'r2', :'b1'),
  '23503', null, '不能連到別人的食譜');
select throws_ok(format($$select public.bookmark_recipe('%s', 'x', null, '%s')$$, :'b2', :'d2'),
  '23505', null, 'id 已被別人用掉不回傳別人的資料');
select public.unbookmark_recipe(:'b1');
select is((select count(*)::int from public.bookmarks), 0, '取消收藏後讀不到');
select lives_ok(format($$select public.bookmark_recipe('%s', '重新收藏', null, '%s')$$, :'b1b', :'d1'), '取消後可以重新收藏同一道');
select tests.logout();

select throws_ok(format($$select public.bookmark_recipe('%s', 'x', null, '%s')$$, :'b2', :'d2'),
  '42501', null, '沒登入不能收藏');

select * from finish();
rollback;
