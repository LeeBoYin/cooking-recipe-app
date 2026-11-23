-- 靈感彩蛋（M1b-04c）：ai_egg_state／ai_egg_save 只有服務權限、彩蛋只有本人讀得到、7 天內的次數與用過的食材廚具、
-- 彩蛋每人只留最近 7 筆、彩蛋和點子一樣能展開做法、上限設定的範圍
begin;
select plan(19);

select tests.create_user('alice@zhusha.test') as alice \gset
select tests.create_user('bob@zhusha.test') as bob \gset
select tests.kitchen_of(:'alice') as ka \gset

-- 一組首頁點子：用過 tofu、thai-basil（其他材料）與 air-fryer
set local role service_role;
select public.ai_home_cache_save(:'alice', :'ka', 'hash-aaaaaaaa', 0::smallint,
  '{"schemaVersion":1,"chefComment":null,"model":"m","ideas":[
    {"id":"idea-1","title":"麻婆豆腐","why":"豆腐在冰箱","candidateRef":null,"usesPantryIds":["tofu"],"otherIngredients":[{"name":"九層塔","ingredientId":"thai-basil"}],"equipment":["air-fryer"]}
  ]}', 24);
reset role;

---------------------------------------------------------------------------
-- 權限
---------------------------------------------------------------------------
select tests.login_as(:'alice');
select throws_ok(format($$select public.ai_egg_state(%L)$$, :'alice'), '42501', null, '本人不能呼叫 ai_egg_state');
select throws_ok(format($$select public.ai_egg_save(%L, %L, 'hash-bbbbbbbb', '{}', 24)$$, :'alice', :'ka'), '42501', null, '本人不能呼叫 ai_egg_save');
select tests.logout();

---------------------------------------------------------------------------
-- 還沒有彩蛋
---------------------------------------------------------------------------
set local role service_role;
select is((public.ai_egg_state(:'alice') ->> 'per_week')::int, 1, '預設每 7 天最多 1 次');
select is((public.ai_egg_state(:'alice') ->> 'count_7d')::int, 0, '還沒出現過');
select is(jsonb_typeof(public.ai_egg_state(:'alice') -> 'latest'), 'null', '沒有最近的彩蛋');
select ok(public.ai_egg_state(:'alice') -> 'used_ingredient_ids' @> '["tofu", "thai-basil"]', '最近的點子用過的食材（含其他材料的字典 ID）');
select ok(public.ai_egg_state(:'alice') -> 'used_equipment_ids' @> '["air-fryer"]', '最近的點子用過的廚具');
select is(public.ai_egg_state(:'bob') -> 'used_ingredient_ids', '[]'::jsonb, '別人的點子不算');

---------------------------------------------------------------------------
-- 存一個彩蛋
---------------------------------------------------------------------------
select public.ai_egg_save(:'alice', :'ka', 'egg-aaaaaaaa',
  '{"schemaVersion":1,"chefComment":null,"model":"m","ideas":[
    {"id":"egg-1","title":"XO 醬炒飯","why":"你有 XO 醬","candidateRef":null,"usesPantryIds":["xo-sauce"],"otherIngredients":[],"equipment":["wok"]}
  ]}', 24) as sid \gset
select is((public.ai_egg_state(:'alice') ->> 'count_7d')::int, 1, '存了之後 7 天內算 1 次');
select is(public.ai_egg_state(:'alice') -> 'latest' ->> 'id', :'sid', '最近的彩蛋就是剛存的');
select ok(public.ai_egg_state(:'alice') -> 'used_ingredient_ids' @> '["xo-sauce"]', '彩蛋自己用過的食材也算（下次換別的）');
select is((select kind from public.ai_suggestion_cache where id = :'sid'::uuid), 'easter_egg', '存成 easter_egg');
select is((public.ai_egg_state(:'bob') ->> 'count_7d')::int, 0, '別人的次數不受影響');

-- 8 天前的不算 7 天內
update public.ai_suggestion_cache set created_at = now() - interval '8 days', expires_at = now() - interval '7 days' where id = :'sid'::uuid;
select is((public.ai_egg_state(:'alice') ->> 'count_7d')::int, 0, '8 天前的彩蛋不算 7 天內');

-- 每人只留最近 7 筆
select public.ai_egg_save(:'alice', :'ka', 'egg-hash-' || g, '{"schemaVersion":1,"chefComment":null,"model":"m","ideas":[]}', 24) from generate_series(1, 8) g;
select is((select count(*)::int from public.ai_suggestion_cache where user_id = :'alice' and kind = 'easter_egg'), 7, '彩蛋只留最近 7 筆');

---------------------------------------------------------------------------
-- 彩蛋和點子一樣能展開做法
---------------------------------------------------------------------------
select public.ai_egg_save(:'bob', null, 'egg-bobbbbbb',
  '{"schemaVersion":1,"chefComment":null,"model":"m","ideas":[{"id":"egg-b","title":"蒜香炒飯","why":"x","candidateRef":null,"usesPantryIds":[],"otherIngredients":[]}]}', 24) as bsid \gset
select is(public.ai_expand_get(:'bob', :'bsid'::uuid, 'egg-b', null) -> 'idea' ->> 'title', '蒜香炒飯', 'ai_expand_get 讀得到彩蛋的點子');
select is(public.ai_expand_get(:'alice', :'bsid'::uuid, 'egg-b', null), null, '別人的彩蛋讀不到');
reset role;

---------------------------------------------------------------------------
-- 設定與讀取權限
---------------------------------------------------------------------------
select throws_ok($$update public.app_config set inspiration_egg_per_week = 8$$, '23514', null, '每週上限最多 7');
select tests.login_as(:'bob');
select is((select count(*)::int from public.ai_suggestion_cache where kind = 'easter_egg'), 1, '本人只讀得到自己的彩蛋');
select tests.logout();

select * from finish();
rollback;
