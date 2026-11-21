-- 和大廚聊聊 ①（M1a-07）：chef_conversations 的權限、ai_chat_get／ai_chat_append、20 輪上限、30 天清除、收藏 AI 想的點子
begin;
select plan(33);

select tests.create_user('alice@zhusha.test') as alice \gset
select tests.create_user('bob@zhusha.test') as bob \gset
select tests.kitchen_of(:'alice') as ka \gset
select private.uuid_v7() as b1 \gset
select private.uuid_v7() as b2 \gset
select private.uuid_v7() as b3 \gset

---------------------------------------------------------------------------
-- 附加一輪（開新的一段）
---------------------------------------------------------------------------
set local role service_role;
select public.ai_chat_append(
  :'alice', :'ka', null, '不要太辣', 'zh-Hant-TW', '有半顆高麗菜', '高麗菜很好用！', null,
  '[{"id":"i1","title":"高麗菜炒蛋","why":"簡單","usesPantryIds":["egg"],"usesMentionedIds":["cabbage"],"otherIngredients":[{"name":"鹽","ingredientId":"salt"}]},
    {"id":"i2","title":"高麗菜捲","why":"換個吃法","usesPantryIds":[],"usesMentionedIds":[],"otherIngredients":[]}]',
  'claude-sonnet-5-5', '有高麗菜', '[{"text":"高麗菜","ingredientId":"cabbage"}]', '[{"dimension_key":"taste.spicy","affinity":-0.4,"scope":"today"}]'
) as r \gset
select is((:'r'::jsonb ->> 'turn_count')::int, 1, '開新的一段，第 1 輪');
select (:'r'::jsonb ->> 'conversation_id') as c1 \gset
select is((public.ai_chat_get(:'alice', :'c1'::uuid) ->> 'summary'), '有高麗菜', '摘要用這一輪的新摘要');
select is(jsonb_array_length(public.ai_chat_get(:'alice', :'c1'::uuid) -> 'messages'), 2, '一輪附加兩則訊息');
select is((public.ai_chat_get(:'alice', :'c1'::uuid) -> 'messages' -> 0 ->> 'role'), 'user', '先是使用者的話');
select is((public.ai_chat_get(:'alice', :'c1'::uuid) -> 'messages' -> 1 ->> 'role'), 'chef', '再是大廚的回應');
select isnt((public.ai_chat_get(:'alice', :'c1'::uuid) -> 'messages' -> 1 ->> 'suggestionId'), null, '大廚這一則附了點子');
select is(jsonb_array_length(public.ai_chat_get(:'alice', :'c1'::uuid) -> 'suggestions'), 1, '點子存在快取裡，跟著對話');
select is((select count(*)::int from public.ai_suggestion_cache where conversation_id = :'c1'::uuid and kind = 'chat'), 1, '快取的種類是 chat');
select is(jsonb_array_length(public.ai_chat_get(:'alice', :'c1'::uuid) -> 'mentioned_ingredients'), 1, '說過的食材記在這段對話');
select is(jsonb_array_length((select preference_signals from public.chef_conversations where id = :'c1'::uuid)), 1, '偏好訊號先存下來');
select is((public.ai_chat_get(:'alice', :'c1'::uuid) ->> 'summary'), '有高麗菜', '附加後摘要還在');

-- 沒有點子（只回答問題）：不建快取
select public.ai_chat_append(:'alice', :'ka', :'c1'::uuid, null, 'zh-Hant-TW', '要先燙嗎', '要先燙一下。', null, '[]', 'm', null, '[]', '[]');
select is((select count(*)::int from public.ai_suggestion_cache where conversation_id = :'c1'::uuid), 1, '沒有點子就不多建快取');
select is((public.ai_chat_get(:'alice', :'c1'::uuid) ->> 'turn_count')::int, 2, '第 2 輪');
select is((public.ai_chat_get(:'alice', :'c1'::uuid) ->> 'summary'), '有高麗菜', '沒給新摘要就沿用舊的');
-- 反問存在大廚那一則
select public.ai_chat_append(:'alice', :'ka', :'c1'::uuid, null, 'zh-Hant-TW', '想吃點熱的', '好', '想吃飯還是麵？', '[]', 'm', null, '[]', '[]');
select is((public.ai_chat_get(:'alice', :'c1'::uuid) -> 'messages' -> 5 ->> 'ask'), '想吃飯還是麵？', '反問跟著大廚那一則存下');
-- 同樣的食材不重複記
select public.ai_chat_append(:'alice', :'ka', :'c1'::uuid, null, 'zh-Hant-TW', '還有高麗菜', '好', null, '[]', 'm', null, '[{"text":"高麗菜","ingredientId":"cabbage"}]', '[]');
select is(jsonb_array_length(public.ai_chat_get(:'alice', :'c1'::uuid) -> 'mentioned_ingredients'), 1, '同一個說法只留一筆');
reset role;

---------------------------------------------------------------------------
-- 權限：本人只能讀，手機不能直接寫，也不能呼叫 ai_chat_*
---------------------------------------------------------------------------
select tests.login_as(:'alice');
select is((select count(*)::int from public.chef_conversations), 1, '本人讀得到自己的對話');
select throws_ok($$update public.chef_conversations set messages = '[]'$$, '42501', null, '本人不能直接改訊息');
select throws_ok(
  format($$insert into public.chef_conversations (id, user_id) values (private.uuid_v7(), %L)$$, :'alice'),
  '42501', null, '本人不能直接新增');
select throws_ok($$delete from public.chef_conversations$$, '42501', null, '本人不能直接刪');
select throws_ok(format($$select public.ai_chat_get(%L, %L)$$, :'alice', :'c1'), '42501', null, '本人不能呼叫 ai_chat_get');
select tests.logout();
select tests.login_as(:'bob');
select is((select count(*)::int from public.chef_conversations), 0, '別人讀不到');
select tests.logout();

set local role service_role;
select is(public.ai_chat_get(:'bob', :'c1'::uuid), null, '不是本人的對話讀不到');
select throws_ok(
  format($$select public.ai_chat_append(%L, null, %L, null, 'zh-Hant-TW', 'x', 'y', null, '[]', 'm', null, '[]', '[]')$$, :'bob', :'c1'),
  'P0002', null, '不是本人的對話不能附加');

---------------------------------------------------------------------------
-- 20 輪上限；開新的一段帶舊的摘要
---------------------------------------------------------------------------
select public.ai_chat_append(:'alice', :'ka', :'c1'::uuid, null, 'zh-Hant-TW', 'x' || n, 'y', null, '[]', 'm', null, '[]', '[]') from generate_series(1, 16) n;
select is((public.ai_chat_get(:'alice', :'c1'::uuid) ->> 'turn_count')::int, 20, '滿 20 輪');
select throws_ok(
  format($$select public.ai_chat_append(%L, %L, %L, null, 'zh-Hant-TW', 'x', 'y', null, '[]', 'm', null, '[]', '[]')$$, :'alice', :'ka', :'c1'),
  '23514', null, '第 21 輪被擋下');
select (public.ai_chat_append(:'alice', :'ka', null, '有高麗菜；不要太辣', 'zh-Hant-TW', 'x', 'y', null, '[]', 'm', null, '[]', '[]') ->> 'conversation_id') as c2 \gset
select is((public.ai_chat_get(:'alice', :'c2'::uuid) ->> 'summary'), '有高麗菜；不要太辣', '新的一段從舊的摘要開始');
reset role;

---------------------------------------------------------------------------
-- 30 天後由每日維護刪除，點子快取跟著刪
---------------------------------------------------------------------------
update public.chef_conversations set last_message_at = now() - interval '31 days' where id = :'c1'::uuid;
select private.purge_old_chat_conversations();
select is((select count(*)::int from public.chef_conversations where id = :'c1'::uuid), 0, '超過 30 天的對話刪掉');
select is((select count(*)::int from public.ai_suggestion_cache where conversation_id = :'c1'::uuid), 0, '點子快取跟著刪');

---------------------------------------------------------------------------
-- 收藏 AI 想的點子
---------------------------------------------------------------------------
set local role service_role;
select public.ai_home_cache_save(:'alice', :'ka', 'hash-00000001', 0::smallint,
  '{"schemaVersion":1,"ideas":[{"id":"i9","title":"三杯杏鮑菇","why":"你愛九層塔","usesPantryIds":["egg"],"usesMentionedIds":[],"otherIngredients":[{"name":"醬油","ingredientId":"soy-sauce"}]}],"chefComment":null,"model":"m"}', 24) as sid \gset
reset role;
select tests.login_as(:'alice');
select lives_ok(format($$select public.bookmark_ai_idea('%s', '%s', '三杯杏鮑菇')$$, :'b1', :'sid'), '本人可以收藏 AI 想的點子');
select is((select (public.bookmark_ai_idea(:'b2', :'sid'::uuid, '三杯杏鮑菇')).id), :'b1'::uuid, '同一則點子同一個菜名再收藏回傳既有那筆');
select throws_ok(format($$select public.bookmark_ai_idea('%s', '%s', '不存在的菜')$$, :'b3', :'sid'), '23503', null, '找不到這個菜名就不能收藏');
select tests.logout();
select tests.login_as(:'bob');
select throws_ok(format($$select public.bookmark_ai_idea('%s', '%s', '三杯杏鮑菇')$$, :'b3', :'sid'), '23503', null, '別人的點子不能收藏');
select tests.logout();

select * from finish();
rollback;
