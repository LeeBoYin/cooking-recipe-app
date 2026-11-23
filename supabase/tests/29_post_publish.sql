-- 發佈後整理與大廚的一句話（M1b-04b）：chef_note 只有作者讀得到、使用者寫不進去、一句話只存一次且限第一次發佈；
-- 發佈與做法改了排隊 post_publish（發佈不受影響、背景回填不排隊）；回報標籤與難易度的規則（author 不蓋、使用者確認過的標籤不蓋、
-- 讀取後又被改過就重排）；自己的食譜寫好標籤才計入口味；ai_suggestion_cache.kind 沒有 observation
begin;
select plan(38);

create function tests.save(p jsonb, p_photos jsonb default null)
returns public.recipes
language plpgsql
as $$
declare
  v_updated timestamptz;
begin
  select updated_at into v_updated from public.recipes where id = (p->>'id')::uuid;
  return public.save_recipe(p, v_updated, null, p_photos);
end;
$$;
grant execute on function tests.save(jsonb, jsonb) to authenticated;

create function tests.add_photo(p_id uuid, p_user uuid, p_recipe uuid)
returns void
language sql
as $$
  insert into storage.objects (bucket_id, name) values
    ('photos', format('users/%s/%s.webp', p_user, p_id)),
    ('photos', format('users/%s/%s_feed.webp', p_user, p_id)),
    ('photos', format('users/%s/%s_thumb.webp', p_user, p_id));
  insert into public.photos (id, user_id, owner_type, owner_id, is_cover, storage_path, feed_path, thumb_path, width, height)
  values (p_id, p_user, 'recipe', p_recipe, true,
          format('users/%s/%s.webp', p_user, p_id), format('users/%s/%s_feed.webp', p_user, p_id), format('users/%s/%s_thumb.webp', p_user, p_id), 1200, 900);
$$;

select tests.create_user('alice@zhusha.test') as alice \gset
select tests.create_user('bob@zhusha.test') as bob \gset
select private.uuid_v7() as r1 \gset
select private.uuid_v7() as r2 \gset
select private.uuid_v7() as ph1 \gset
select private.uuid_v7() as ph2 \gset

-- 模擬雲端：服務權限對資料表沒有預設的讀寫權限
revoke all on public.recipes, public.recipe_private, public.background_jobs, public.bookmarks from service_role;

insert into public.dict_ingredients (id, name, aliases, family, category, default_storage, is_perishable)
  values ('pp-egg', '{"zh-TW": "測試蛋"}', '{"zh-TW": []}', 'pp-egg-family', 'egg', 'fridge', true);

---------------------------------------------------------------------------
-- 一、發佈排隊
---------------------------------------------------------------------------
select tests.login_as(:'alice');
select tests.save(format('{"id":"%s","title":"番茄炒蛋","story":"小時候的味道","ingredients":[{"id":"i1","raw_text":"蛋 3 顆","optional":false}],"steps":[{"id":"00000000-0000-4000-8000-000000000001","order":1,"text":"先炒蛋"}]}', :'r1')::jsonb);
select tests.logout();
select tests.add_photo(:'ph1', :'alice', :'r1');
select is((select count(*)::int from public.background_jobs where kind = 'post_publish'), 0, '草稿不排隊');

select tests.login_as(:'alice');
select lives_ok(format($$select public.publish_recipe('%s')$$, :'r1'), '發佈成功');
select tests.logout();
select is((select count(*)::int from public.background_jobs where kind = 'post_publish' and dedupe_key = :'r1' and status = 'pending' and payload->>'mode' = 'publish' and requested_by = :'alice'), 1, '發佈時排一筆 post_publish（publish）');

-- 已發佈的食譜：只改不影響內容的欄位不排隊；改做法升級成 edit（同一篇只會有一筆）
select tests.login_as(:'alice');
select tests.save(format('{"id":"%s","highlights":["make_again"]}', :'r1')::jsonb);
select tests.logout();
select is((select payload->>'mode' from public.background_jobs where kind = 'post_publish' and dedupe_key = :'r1'), 'publish', '改亮點不改變任務');
select tests.login_as(:'alice');
select tests.save(format('{"id":"%s","steps":[{"id":"00000000-0000-4000-8000-000000000001","order":1,"text":"先炒蛋再放番茄"}]}', :'r1')::jsonb);
select tests.logout();
select is((select count(*)::int from public.background_jobs where kind = 'post_publish' and dedupe_key = :'r1'), 1, '同一篇只有一筆');
select is((select payload->>'mode' from public.background_jobs where kind = 'post_publish' and dedupe_key = :'r1'), 'edit', '做法改了升級成 edit');

---------------------------------------------------------------------------
-- 二、背景函式：領、讀、回報
---------------------------------------------------------------------------
select tests.login_as(:'alice');
select throws_ok(format($$select public.post_publish_context('%s')$$, gen_random_uuid()), '42501', null, '使用者不能呼叫 post_publish_context');
select throws_ok(format($$select public.complete_post_publish('%s', null, null, now())$$, gen_random_uuid()), '42501', null, '使用者不能呼叫 complete_post_publish');
select throws_ok($$select public.save_chef_note(gen_random_uuid(), gen_random_uuid(), 'x')$$, '42501', null, '使用者不能呼叫 save_chef_note');
select tests.logout();

set local role service_role;
select is(jsonb_array_length(public.claim_background_jobs('post_publish', 10)), 1, '領到一個 post_publish');
reset role;
select id as job1 from public.background_jobs where kind = 'post_publish' and dedupe_key = :'r1' \gset

select updated_at as read_at from public.recipes where id = :'r1' \gset
set local role service_role;
select is(public.post_publish_context(:'job1') ->> 'title', '番茄炒蛋', 'context 帶回食譜內容');
select is(public.post_publish_context(:'job1') ->> 'difficulty_source', null, '還沒有難易度');
select is(public.complete_post_publish(:'job1',
  '{"cuisine_keys":["cuisine.taiwan.home"],"main_ingredient_ids":["pp-egg","no-such-id"],"techniques":["pan-fry"],"equipment_type_ids":[]}'::jsonb,
  '{"ingredients":1,"equipment":1,"time":1,"technique":2,"failure_risk":1,"estimated_from":"recipe"}'::jsonb,
  :'read_at'), true, '回報標籤與難易度');
reset role;
select is((select ai_tags->'main_ingredient_ids' from public.recipes where id = :'r1'), '["pp-egg"]'::jsonb, '主食材只收字典裡有的');
select is((select ai_tags->>'confirmed_by_user' from public.recipes where id = :'r1'), 'false', '標籤不是使用者確認的');
select is((select difficulty->>'source' from public.recipes where id = :'r1'), 'ai', '難易度是 AI 估的');
select is((select difficulty->>'overall' from public.recipes where id = :'r1'), '1', '總分由資料庫算');
select is((select ingredient_ids from public.recipes where id = :'r1'), '{pp-egg}'::text[], '食材清單沒有對應到字典時，食材 ID 用 AI 補的主食材');
select is((select status from public.background_jobs where id = :'job1'), 'done', '任務完成');
select is((select updated_at from public.recipes where id = :'r1'), :'read_at'::timestamptz, '背景回填不改 updated_at');
select is((select count(*)::int from public.background_jobs where kind = 'post_publish' and status = 'pending'), 0, '背景回填不會再排隊');
select is((select version from public.recipes where id = :'r1'), 2, '背景回填不算新的一版');

-- author 的難易度不蓋
select tests.login_as(:'alice');
select tests.save(format('{"id":"%s","tips":"水分要收乾","difficulty":{"ingredients":5,"equipment":5,"time":5,"technique":5,"failure_risk":5,"overall":10,"source":"author"}}', :'r1')::jsonb);
select tests.logout();
select id as job2 from public.background_jobs where kind = 'post_publish' and dedupe_key = :'r1' and status = 'pending' \gset
select updated_at as read_at2 from public.recipes where id = :'r1' \gset
set local role service_role;
select public.claim_background_jobs('post_publish', 10);
select public.complete_post_publish(:'job2', null,
  '{"ingredients":1,"equipment":1,"time":1,"technique":1,"failure_risk":1,"estimated_from":"recipe"}'::jsonb, :'read_at2');
reset role;
select is((select difficulty->>'source' from public.recipes where id = :'r1'), 'author', '作者動過的難易度不被蓋掉');
select is((select difficulty->>'overall' from public.recipes where id = :'r1'), '10', '總分維持作者的');

-- 讀取之後食譜又被改過：這次不寫、放回佇列
select tests.login_as(:'alice');
select tests.save(format('{"id":"%s","tips":"小火"}', :'r1')::jsonb);
select tests.logout();
select id as job3 from public.background_jobs where kind = 'post_publish' and dedupe_key = :'r1' and status = 'pending' \gset
set local role service_role;
select public.claim_background_jobs('post_publish', 10);
reset role;
select tests.login_as(:'alice');
select tests.save(format('{"id":"%s","tips":"大火"}', :'r1')::jsonb);
select tests.logout();
set local role service_role;
select is(public.complete_post_publish(:'job3', '{"cuisine_keys":["cuisine.japan"],"main_ingredient_ids":[],"techniques":[],"equipment_type_ids":[]}'::jsonb, null,
  now() - interval '1 hour'), false, '讀取後又被改過：不寫入');
reset role;
select is((select status from public.background_jobs where id = :'job3'), 'pending', '任務放回佇列');
select is((select ai_tags->'cuisine_keys' from public.recipes where id = :'r1'), '["cuisine.taiwan.home"]'::jsonb, '標籤維持原樣');

---------------------------------------------------------------------------
-- 三、大廚的一句話
---------------------------------------------------------------------------
set local role service_role;
select is(public.chef_note_context(:'alice', :'r1') ->> 'title', '番茄炒蛋', '剛發佈的食譜可以請大廚說一句話');
select is(public.chef_note_context(:'bob', :'r1'), null, '別人的食譜不行');
select is(public.save_chef_note(:'alice', :'r1', '蛋炒得這麼嫩，配飯剛好。'), true, '存一句話');
select is(public.save_chef_note(:'alice', :'r1', '第二句'), false, '已經有就不蓋掉');
select is(public.chef_note_context(:'alice', :'r1'), null, '有了一句話就不再問');
reset role;
select is((select chef_note->>'text' from public.recipe_private where recipe_id = :'r1'), '蛋炒得這麼嫩，配飯剛好。', '一句話存在 recipe_private');

select tests.login_as(:'alice');
select is((select chef_note->>'text' from public.recipe_private where recipe_id = :'r1'), '蛋炒得這麼嫩，配飯剛好。', '作者讀得到');
select throws_ok(format($$update public.recipe_private set chef_note = '{"text":"改","at":"x"}' where recipe_id = '%s'$$, :'r1'), '42501', null, '作者不能自己改一句話');
select tests.logout();
select tests.login_as(:'bob');
select is((select count(*)::int from public.recipe_private where recipe_id = :'r1'), 0, '別人讀不到');
select tests.logout();

-- 發佈超過 10 分鐘的（不是第一次發佈）不能再問
update public.recipes set published_at = now() - interval '1 day' where id = :'r1';
delete from public.recipe_private where recipe_id = :'r1';
set local role service_role;
select is(public.chef_note_context(:'alice', :'r1'), null, '不是剛發佈的不問');
reset role;

---------------------------------------------------------------------------
-- 四、ai_suggestion_cache.kind
---------------------------------------------------------------------------
select throws_ok(format($$insert into public.ai_suggestion_cache (id, user_id, kind, input_hash, payload, expires_at) values ('%s', '%s', 'observation', 'hhhhhhhh', '{}', now() + interval '1 day')$$, private.uuid_v7(), :'alice'), '23514', null, 'kind 沒有 observation');

select * from finish();
rollback;
