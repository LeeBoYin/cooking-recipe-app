-- 點子抽屜直接顯示做法（M1a-09）：ai_expand_get／ai_expand_save 的權限與資料、收藏時帶著做法、點子快照不能被改
begin;
select plan(27);

select tests.create_user('alice@zhusha.test') as alice \gset
select tests.create_user('bob@zhusha.test') as bob \gset
select tests.kitchen_of(:'alice') as ka \gset
select private.uuid_v7() as b1 \gset
select private.uuid_v7() as b2 \gset
select private.uuid_v7() as b3 \gset
select private.uuid_v7() as b4 \gset

set local role service_role;
select public.ai_home_cache_save(:'alice', :'ka', 'hash-aaaaaaaa', 0::smallint,
  '{"schemaVersion":1,"chefComment":null,"model":"m","ideas":[
    {"id":"idea-dish","title":"麻婆豆腐","why":"豆腐在冰箱","candidateRef":"dish:mapo-tofu","usesPantryIds":["tofu"],"otherIngredients":[]},
    {"id":"idea-ai","title":"三杯杏鮑菇","why":"換個吃法","candidateRef":null,"usesPantryIds":["king-oyster-mushroom"],"otherIngredients":[{"name":"九層塔","ingredientId":"thai-basil"}]}
  ]}', 24) as sid \gset
reset role;

---------------------------------------------------------------------------
-- 權限：只有服務權限能讀寫
---------------------------------------------------------------------------
select tests.login_as(:'alice');
select throws_ok(format($$select public.ai_expand_get(%L, %L, 'idea-dish', null)$$, :'alice', :'sid'), '42501', null, '本人不能呼叫 ai_expand_get');
select throws_ok(format($$select public.ai_expand_save(%L, %L, 'idea-dish', null, '{}')$$, :'alice', :'sid'), '42501', null, '本人不能呼叫 ai_expand_save');
select tests.logout();

---------------------------------------------------------------------------
-- ai_expand_get
---------------------------------------------------------------------------
set local role service_role;
select is((public.ai_expand_get(:'alice', :'sid'::uuid, 'idea-dish', null) -> 'idea' ->> 'title'), '麻婆豆腐', '讀得到點子本身');
select is((public.ai_expand_get(:'alice', :'sid'::uuid, 'idea-dish', null) ->> 'household_size')::int, 2, '附上平常煮幾人份');
select is(jsonb_typeof(public.ai_expand_get(:'alice', :'sid'::uuid, 'idea-dish', null) -> 'draft'), 'null', '還沒展開過沒有做法');
select is((public.ai_expand_get(:'bob', :'sid'::uuid, 'idea-dish', null)), null, '別人的快取列讀不到');
select is((public.ai_expand_get(:'alice', :'sid'::uuid, 'no-such-idea', null)), null, '找不到點子回空');

---------------------------------------------------------------------------
-- ai_expand_save：存進快取列的 drafts
---------------------------------------------------------------------------
select lives_ok(
  format($$select public.ai_expand_save(%L, %L, 'idea-dish', null, '{"schemaVersion":1,"servings":2,"ingredients":[],"steps":[],"model":"m"}')$$, :'alice', :'sid'),
  '服務權限可以存做法');
select is((public.ai_expand_get(:'alice', :'sid'::uuid, 'idea-dish', null) -> 'draft' ->> 'servings')::int, 2, '再讀就有做法');
select is((select jsonb_object_keys(drafts) from public.ai_suggestion_cache where id = :'sid'::uuid), 'idea-dish', '依點子 ID 存');
select throws_ok(format($$select public.ai_expand_save(%L, %L, 'idea-dish', null, '"x"')$$, :'alice', :'sid'), '22023', null, '做法必須是物件');
-- 別人用自己的 ID 呼叫、帶別人的快取列：不會寫進去
select public.ai_expand_save(:'bob', :'sid'::uuid, 'idea-ai', null, '{"schemaVersion":1}');
select is((select count(*)::int from public.ai_suggestion_cache where id = :'sid'::uuid and drafts ? 'idea-ai'), 0, '不是本人的快取列寫不進去');
reset role;

---------------------------------------------------------------------------
-- 收藏時帶著做法：家常菜（bookmark_recipe）與 AI 想的點子（bookmark_ai_idea）
---------------------------------------------------------------------------
select tests.login_as(:'alice');
select lives_ok(format($$select public.bookmark_recipe('%s', '麻婆豆腐', '豆腐在冰箱', 'mapo-tofu', '%s', 'idea-dish')$$, :'b1', :'sid'), '家常菜收藏，帶著點子的 ID');
select is((select idea -> 'recipeDraft' ->> 'servings' from public.bookmarks where id = :'b1'), '2', '快取裡已經有做法就一起存進收藏');
select lives_ok(format($$select public.bookmark_recipe('%s', '蒸蛋', null, 'steamed-egg')$$, :'b2'), '舊的四個參數照樣能收藏');
select is((select idea ? 'recipeDraft' from public.bookmarks where id = :'b2'), false, '沒有做法就沒有 recipeDraft');
select lives_ok(format($$select public.bookmark_ai_idea('%s', '%s', '三杯杏鮑菇')$$, :'b3', :'sid'), '收藏 AI 想的點子（還沒展開過）');
select is((select idea ? 'recipeDraft' from public.bookmarks where id = :'b3'), false, '還沒展開過，收藏裡沒有做法');
select tests.logout();

-- 之後才展開：快取列與收藏同時存
set local role service_role;
select is((public.ai_expand_get(:'alice', :'sid'::uuid, 'idea-ai', null) ->> 'bookmark_id'), :'b3', '點子已收藏：回傳對應的收藏');
select public.ai_expand_save(:'alice', :'sid'::uuid, 'idea-ai', :'b3'::uuid, '{"schemaVersion":1,"servings":3,"ingredients":[],"steps":[],"model":"m"}');
select is((select idea -> 'recipeDraft' ->> 'servings' from public.bookmarks where id = :'b3'), '3', '同時存進收藏的 recipeDraft');
select is((select drafts -> 'idea-ai' ->> 'servings' from public.ai_suggestion_cache where id = :'sid'::uuid), '3', '也存進快取列的 drafts');
-- 收藏的點子：從收藏讀
select is((public.ai_expand_get(:'alice', null, null, :'b3'::uuid) -> 'snapshot' ->> 'title'), '三杯杏鮑菇', '從收藏讀快照');
select is((public.ai_expand_get(:'alice', null, null, :'b3'::uuid) -> 'idea' ->> 'id'), 'idea-ai', '快取還在就讀得到點子本身');
select is((public.ai_expand_get(:'bob', null, null, :'b3'::uuid)), null, '別人的收藏讀不到');
reset role;

---------------------------------------------------------------------------
-- 收藏的點子快照不能被改（只有 recipeDraft 可以由後端補）
---------------------------------------------------------------------------
select tests.login_as(:'alice');
select throws_ok(format($$update public.bookmarks set idea = '{"schemaVersion":1,"title":"x","baseDishId":"y"}' where id = '%s'$$, :'b1'), '42501', null, '本人不能直接改點子的快照');
select tests.logout();
update public.bookmarks set idea = jsonb_set(idea, '{title}', '"改過的菜名"') where id = :'b1'::uuid;
select is((select idea ->> 'title' from public.bookmarks where id = :'b1'::uuid), '麻婆豆腐', '就算由後端更新，菜名也不會被改');
select throws_ok(format($$update public.bookmarks set idea = idea || '{"recipeDraft":"x"}' where id = '%s'$$, :'b1'), '23514', null, 'recipeDraft 必須是物件');

select * from finish();
rollback;
