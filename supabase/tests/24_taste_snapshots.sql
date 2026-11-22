-- 口味檔案快照與點子回饋（M1a-10a）：taste_profile_snapshots 的權限、觸發器標成過期、taste_profile_save、
-- ai_home_context 的快照與原始資料、點子回饋（收藏、做了）寫進 ai_suggestion_cache.feedback
begin;
select plan(46);

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
select private.uuid_v7() as b1 \gset
select private.uuid_v7() as b2 \gset
select private.uuid_v7() as b5 \gset
select private.uuid_v7() as r1 \gset
select private.uuid_v7() as r2 \gset
select private.uuid_v7() as r3b \gset
select id as d1 from public.dict_base_dishes order by id limit 1 \gset

-- 模擬雲端：服務權限對資料表沒有預設的讀寫權限（只有明確授權的）
revoke all on all tables in schema public from service_role;
grant select on public.taste_profile_snapshots to service_role;

---------------------------------------------------------------------------
-- 沒有快照：ai_home_context 附上原始資料
---------------------------------------------------------------------------
set local role service_role;
select is(public.ai_home_context(:'alice') -> 'taste_snapshot', 'null'::jsonb, '沒有快照時 taste_snapshot 是 null');
select ok(public.ai_home_context(:'alice') -> 'taste_inputs' is not null and jsonb_typeof(public.ai_home_context(:'alice') -> 'taste_inputs') = 'object', '沒有快照時附上重算用的原始資料');
select ok(public.ai_home_context(:'alice') ->> 'read_at' is not null, '回傳讀取時間');

-- 只有服務權限能存
select lives_ok(
  format($$select public.taste_profile_save(%L, '{"schemaVersion":1,"dims":{"taste.spicy":{"affinity":0.6,"confidence":0.4,"source":"learned","updatedAt":"2026-11-22T00:00:00Z"}},"context":{"adventure":0.2,"goals":[],"festiveDishes":false},"sources":{"quiz":false,"saved":1,"cooked":0,"signals":0,"pantry":0}}', now())$$, :'alice'),
  '服務權限可以存口味檔案');
select throws_ok(
  format($$select public.taste_profile_save(%L, '{"schemaVersion":2}', now())$$, :'alice'),
  '23514', null, '格式不對（schemaVersion、缺欄位）存不進去');
select throws_ok(
  format($$select public.taste_profile_save(%L, '{"schemaVersion":1,"dims":{"x":{"affinity":2,"confidence":0.4,"source":"learned","updatedAt":"t"}},"context":{"adventure":0.2,"goals":[],"festiveDishes":false},"sources":{"quiz":false,"saved":0,"cooked":0,"signals":0,"pantry":0}}', now())$$, :'alice'),
  '23514', null, '喜好超出 −1～1 存不進去');
select is(public.ai_home_context(:'alice') -> 'taste_snapshot' ->> 'stale', 'false', '存完是新鮮的');
select is(public.ai_home_context(:'alice') -> 'taste_inputs', 'null'::jsonb, '新鮮時不附原始資料');
reset role;

---------------------------------------------------------------------------
-- 權限：本人只能讀自己的，不能寫；別人讀不到
---------------------------------------------------------------------------
select tests.login_as(:'alice');
select is((select count(*)::int from public.taste_profile_snapshots), 1, '本人讀得到自己的口味檔案');
select throws_ok($$update public.taste_profile_snapshots set stale = true$$, '42501', null, '本人不能改');
select throws_ok(format($$insert into public.taste_profile_snapshots (user_id, data) values (%L, '{}')$$, :'bob'), '42501', null, '本人不能新增');
select throws_ok($$delete from public.taste_profile_snapshots$$, '42501', null, '本人不能刪');
select throws_ok(format($$select public.taste_profile_save(%L, '{}', now())$$, :'alice'), '42501', null, '本人不能呼叫 taste_profile_save');
select tests.logout();
select tests.login_as(:'bob');
select is((select count(*)::int from public.taste_profile_snapshots), 0, '別人讀不到');
select tests.logout();

---------------------------------------------------------------------------
-- 觸發器：資料一變就標成過期（用服務權限存一次，確認回到新鮮）
---------------------------------------------------------------------------
create function tests.fresh(p_user uuid) returns void language sql security definer as $$
  update public.taste_profile_snapshots set stale = false where user_id = p_user;
$$;
create function tests.stale(p_user uuid) returns boolean language sql security definer as $$
  select stale from public.taste_profile_snapshots where user_id = p_user;
$$;

select tests.login_as(:'alice');
update public.preference_profiles set dims = '{"taste.spicy":{"affinity":0.5,"confidence":0.6,"source":"user_set","updated_at":"2026-11-22T00:00:00Z"}}' where user_id = :'alice';
select tests.logout();
select ok(tests.stale(:'alice'), '口味地圖改了：過期');

select tests.fresh(:'alice');
select tests.login_as(:'alice');
update public.preference_profiles set answered_item_ids = '{a}' where user_id = :'alice';
select tests.logout();
select ok(not tests.stale(:'alice'), '只改已回答的題目：不過期');

-- 收藏、取消收藏
select tests.login_as(:'alice');
select public.bookmark_recipe(:'b1', '測試菜', null, :'d1');
select tests.logout();
select ok(tests.stale(:'alice'), '收藏了：過期');
select tests.fresh(:'alice');
select tests.login_as(:'alice');
select public.unbookmark_recipe(:'b1');
select tests.logout();
select ok(tests.stale(:'alice'), '取消收藏：過期');

-- 做了並記錄
select tests.fresh(:'alice');
select tests.login_as(:'alice');
select public.bookmark_recipe(:'b2', '另一道', null, (select id from public.dict_base_dishes order by id offset 1 limit 1));
select tests.fresh(:'alice');
select tests.save(format('{"id":"%s","title":"我的版本"}', :'r1')::jsonb);
select public.record_bookmark_cooked(:'b2', :'r1');
select tests.logout();
select ok(tests.stale(:'alice'), '連到自己的食譜（做了）：過期');

-- 食材櫃：同廚房的成員都要標；別的廚房的人不受影響
select tests.create_user('carol@zhusha.test') as carol \gset
select tests.kitchen_of(:'carol') as kc \gset
insert into public.kitchen_members (id, kitchen_id, user_id, role) values (private.uuid_v7(), :'ka', :'carol', 'member');
set local role service_role;
select public.taste_profile_save(:'carol', '{"schemaVersion":1,"dims":{},"context":{"adventure":0.2,"goals":[],"festiveDishes":false},"sources":{"quiz":false,"saved":0,"cooked":0,"signals":0,"pantry":0}}', now());
reset role;
select tests.fresh(:'alice');
select tests.fresh(:'carol');
select private.uuid_v7() as p1 \gset
select tests.login_as(:'alice');
select count(*) from public.add_pantry_items(:'ka', jsonb_build_array(jsonb_build_object('id', :'p1', 'ingredient_id', 'egg', 'raw_name', '蝦仁')));
select tests.logout();
select ok(tests.stale(:'alice') and tests.stale(:'carol'), '食材櫃加了東西：同廚房的成員都過期');
select tests.fresh(:'alice');
select tests.fresh(:'carol');
update public.pantry_items set want_to_use_soon = true where id = :'p1';
select ok(not tests.stale(:'alice') and not tests.stale(:'carol'), '只改「想先用掉」：不過期');
update public.pantry_items set status = 'removed', removed_at = now(), removed_by = :'alice' where id = :'p1';
select ok(tests.stale(:'alice') and tests.stale(:'carol'), '移除食材：同廚房的成員都過期');

-- 對話裡的偏好
select tests.fresh(:'alice');
set local role service_role;
select public.ai_chat_append(
  :'alice', :'ka', null, null, 'zh-Hant-TW', '我不太吃辣', '好的', null, '[]', 'm', null, '[]',
  '[{"dimension_key":"taste.spicy","affinity":-0.4,"scope":"long_term"}]');
reset role;
select ok(tests.stale(:'alice'), '對話有新的偏好訊號：過期');
select tests.fresh(:'alice');
select id as conv from public.chef_conversations where user_id = :'alice' limit 1 \gset
set local role service_role;
select public.ai_chat_append(:'alice', :'ka', :'conv'::uuid, null, 'zh-Hant-TW', '還有', '好', null, '[]', 'm', null, '[]', '[]');
reset role;
select ok(not tests.stale(:'alice'), '對話沒有新的偏好訊號：不過期');

---------------------------------------------------------------------------
-- 過期時 ai_home_context 附上原始資料；沒有被取消的收藏才算
---------------------------------------------------------------------------
set local role service_role;
select is(public.ai_home_context(:'alice') -> 'taste_snapshot' ->> 'stale', 'false', '先確認是新鮮的');
reset role;
select tests.login_as(:'alice');
select public.unbookmark_recipe(:'b2');
select public.bookmark_recipe(:'b5', '測試菜', null, :'d1');
select tests.logout();
set local role service_role;
select is(public.ai_home_context(:'alice') -> 'taste_snapshot' ->> 'stale', 'true', '標成過期後 ai_home_context 反映');
select is(jsonb_array_length(public.ai_home_context(:'alice') -> 'taste_inputs' -> 'saved'), 1, '原始資料只有還在收藏裡的點子');
select is(public.ai_home_context(:'alice') -> 'taste_inputs' -> 'saved' -> 0 ->> 'cooked', 'false', '還沒記錄的收藏 cooked 是 false');
select is(jsonb_array_length(public.ai_home_context(:'alice') -> 'taste_inputs' -> 'signals'), 1, '附上對話裡的偏好訊號');
-- 超過 30 天沒重算：ai_home_context 當作過期並附原始資料（先把標記清掉，只看天數）
reset role;
update public.taste_profile_snapshots set stale = false, computed_at = now() - interval '31 days' where user_id = :'alice';
set local role service_role;
select is(public.ai_home_context(:'alice') -> 'taste_snapshot' ->> 'stale', 'true', '超過 30 天沒重算：當作過期');
select ok(jsonb_typeof(public.ai_home_context(:'alice') -> 'taste_inputs') = 'object', '過期就附原始資料');
reset role;
update public.taste_profile_snapshots set computed_at = now() - interval '29 days' where user_id = :'alice';
set local role service_role;
select is(public.ai_home_context(:'alice') -> 'taste_snapshot' ->> 'stale', 'false', '29 天內仍是新鮮的');
-- 讀完後又有變動：save 之後仍維持過期
select public.taste_profile_save(:'alice', (select data from public.taste_profile_snapshots where user_id = :'alice'), now() - interval '1 day');
select is(public.ai_home_context(:'alice') -> 'taste_snapshot' ->> 'stale', 'true', '讀取之後又有變動（updated_at 比讀取時間新）：存完仍然過期');
select public.taste_profile_save(:'alice', (select data from public.taste_profile_snapshots where user_id = :'alice'), now());
select is(public.ai_home_context(:'alice') -> 'taste_snapshot' ->> 'stale', 'false', '沒有在讀取之後變動：存完是新鮮的');
reset role;

---------------------------------------------------------------------------
-- 點子回饋：收藏 AI 的點子記 bookmarked、做了記 recorded；同一種只記一次
---------------------------------------------------------------------------
select tests.login_as(:'bob');
select tests.logout();
set local role service_role;
select public.ai_home_cache_save(:'alice', :'ka',
  'hash-aaaaaaaa', 0::smallint,
  '{"schemaVersion":1,"ideas":[{"id":"idea-1","slot":"familiar","title":"蛋炒飯","why":"簡單","candidateRef":null,"usesPantryIds":["egg"],"usesPriorityIds":[],"otherIngredients":[],"difficulty":{"ingredients":1,"equipment":1,"time":1,"technique":1,"failure_risk":1,"overall":1},"techniques":[],"equipment":[],"substitutions":[]}],"chefComment":null,"model":"m"}', 24) as sid \gset
reset role;
select tests.fresh(:'alice');
select private.uuid_v7() as b3 \gset
select private.uuid_v7() as b4 \gset
select private.uuid_v7() as r3 \gset
select tests.login_as(:'alice');
select public.bookmark_ai_idea(:'b3', :'sid', '蛋炒飯');
select tests.logout();
select is((select feedback -> 0 ->> 'action' from public.ai_suggestion_cache where id = :'sid'), 'bookmarked', '收藏 AI 的點子：記一筆 bookmarked');
select is((select feedback -> 0 ->> 'ideaId' from public.ai_suggestion_cache where id = :'sid'), 'idea-1', 'ideaId 是點子的 id');
select is((select idea -> 'origin' ->> 'ideaId' from public.bookmarks where id = :'b3'), 'idea-1', '收藏記下點子的出處');
select ok(tests.stale(:'alice'), '寫了回饋：過期');
select tests.login_as(:'alice');
select tests.save(format('{"id":"%s","title":"蛋炒飯我的版本"}', :'r3')::jsonb);
select public.record_bookmark_cooked(:'b3', :'r3');
select public.record_bookmark_cooked(:'b3', :'r3');
select tests.logout();
select is((select jsonb_array_length(feedback) from public.ai_suggestion_cache where id = :'sid'), 2, '做了：再記一筆 recorded，重複呼叫不會多記');
select is((select feedback -> 1 ->> 'action' from public.ai_suggestion_cache where id = :'sid'), 'recorded', '第二筆是 recorded');

-- 收藏家常菜時帶了假的點子 id：不記回饋、不存出處
select tests.login_as(:'alice');
select public.bookmark_recipe(:'b4', '假的', null, (select id from public.dict_base_dishes order by id offset 2 limit 1), :'sid', 'not-an-idea');
select tests.logout();
select is((select jsonb_array_length(feedback) from public.ai_suggestion_cache where id = :'sid'), 2, '不在那一組裡的點子 id：不記回饋');
select is((select idea ? 'origin' from public.bookmarks where id = :'b4'), false, '不存出處');

-- 快取已經不在：做了仍然連得到食譜，只是沒有回饋
delete from public.ai_suggestion_cache where id = :'sid';
select tests.login_as(:'alice');
select tests.save(format('{"id":"%s","title":"另一篇"}', :'r2')::jsonb);
select lives_ok(format($$select public.record_bookmark_cooked('%s', '%s')$$, :'b4', :'r2'), '快取已經不在：照樣連到食譜');
select is((select cooked_recipe_id from public.bookmarks where id = :'b4'), :'r2'::uuid, '食譜連上了');
select tests.logout();
select tests.login_as(:'bob');
select tests.save(format('{"id":"%s","title":"別人的"}', :'r3b')::jsonb);
select tests.logout();
select tests.login_as(:'alice');
select throws_ok(format($$select public.record_bookmark_cooked('%s', '%s')$$, :'b4', :'r3b'), '23503', null, '不能連到別人的食譜');
select throws_ok(format($$select public.record_bookmark_cooked('%s', '%s')$$, :'b1', :'r2'), '23503', null, '已經取消的收藏不能記');
select tests.logout();

select * from finish();
rollback;
