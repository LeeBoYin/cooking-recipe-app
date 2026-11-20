-- 食譜：save_recipe／publish_recipe／delete_recipe／restore_recipe、可見範圍、私人資料、
-- 食譜與步驟照片的權限與張數上限（16 第三～五節）
begin;
select plan(116);

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

-- 儲存：自動帶上目前的 updated_at（同一個交易裡 now() 不變，衝突用另外的測試）
create function tests.save(p jsonb, p_private jsonb default null, p_photos jsonb default null)
returns public.recipes
language plpgsql
as $$
declare
  v_updated timestamptz;
begin
  select updated_at into v_updated from public.recipes where id = (p->>'id')::uuid;
  return public.save_recipe(p, v_updated, p_private, p_photos);
end;
$$;

-- 組出 p_photos 的一項
create function tests.photo(p_id uuid, p_type text, p_owner uuid default null)
returns jsonb
language sql
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_id, 'owner_type', p_type, 'owner_id', p_owner, 'width', 1200, 'height', 900));
$$;

create function tests.add_photo(
  p_id uuid, p_user uuid, p_type text, p_owner uuid,
  p_recipe uuid default null, p_note uuid default null, p_cover boolean default false
)
returns void
language sql
as $$
  insert into public.photos (id, user_id, owner_type, owner_id, recipe_id, cook_note_id, is_cover,
                             storage_path, feed_path, thumb_path, width, height)
  values (p_id, p_user, p_type, p_owner, p_recipe, p_note, p_cover,
          format('users/%s/%s.webp', p_user, p_id),
          format('users/%s/%s_feed.webp', p_user, p_id),
          format('users/%s/%s_thumb.webp', p_user, p_id), 1200, 900);
$$;

-- 模擬三個檔案都上傳完成（超級使用者）
create function tests.add_files(p_user uuid, p_id uuid)
returns void
language sql
as $$
  insert into storage.objects (bucket_id, name) values
    ('photos', format('users/%s/%s.webp', p_user, p_id)),
    ('photos', format('users/%s/%s_feed.webp', p_user, p_id)),
    ('photos', format('users/%s/%s_thumb.webp', p_user, p_id));
$$;
grant execute on function tests.updated_rows(text), tests.save(jsonb, jsonb, jsonb), tests.photo(uuid, text, uuid),
  tests.add_photo(uuid, uuid, text, uuid, uuid, uuid, boolean) to authenticated;

select tests.create_user('owner@zhusha.test') as owner \gset
select tests.create_user('mate@zhusha.test') as mate \gset
select tests.create_user('stranger@zhusha.test') as stranger \gset
select tests.kitchen_of(:'owner') as k1 \gset
select tests.kitchen_of(:'stranger') as k2 \gset
insert into public.kitchen_members (id, kitchen_id, user_id, role)
  values (private.uuid_v7(), :'k1', :'mate', 'member');

select private.uuid_v7() as r1 \gset
select private.uuid_v7() as r2 \gset
select private.uuid_v7() as r3 \gset
select private.uuid_v7() as r4 \gset
select private.uuid_v7() as s1 \gset
select private.uuid_v7() as s2 \gset
select private.uuid_v7() as n1 \gset
select private.uuid_v7() as ph1 \gset
select private.uuid_v7() as ph2 \gset
select private.uuid_v7() as ph3 \gset
select private.uuid_v7() as ph4 \gset
select private.uuid_v7() as ph5 \gset
select private.uuid_v7() as ph6 \gset
select private.uuid_v7() as ph7 \gset
select private.uuid_v7() as ph8 \gset
select private.uuid_v7() as ph9 \gset
select private.uuid_v7() as ph10 \gset

select tests.add_files(:'owner', ph) from (values (:'ph1'::uuid), (:'ph2'::uuid), (:'ph3'::uuid), (:'ph4'::uuid),
  (:'ph5'::uuid), (:'ph6'::uuid), (:'ph7'::uuid), (:'ph8'::uuid), (:'ph9'::uuid)) as t(ph);

---------------------------------------------------------------------------
-- 新增草稿與衍生欄位
---------------------------------------------------------------------------
select tests.login_as(:'owner');

select lives_ok(format($$select tests.save('{"id":"%s","title":"番茄炒蛋"}')$$, :'r1'), '新增一篇草稿');
select is((select status from public.recipes where id = :'r1'), 'draft', '新增的是草稿');
select is((select kitchen_id from public.recipes where id = :'r1'), :'k1'::uuid, '廚房預設為目前的廚房');
select is((select version from public.recipes where id = :'r1'), 1, '版本從 1 開始');
select is((select visibility from public.recipes where id = :'r1'), 'friends', '預設給好友看');

select lives_ok(format($$select tests.save('{"id":"%s","ingredients":[
  {"id":"i1","raw_text":"牛肉片 200g","ingredient_id":"beef-slices","optional":false},
  {"id":"i2","raw_text":"高麗菜","ingredient_id":"cabbage","optional":false},
  {"id":"i3","raw_text":"牛肉片再來一些","ingredient_id":"beef-slices","optional":false},
  {"id":"i4","raw_text":"鹽","ingredient_id":"not-in-dictionary","optional":true}
 ],"steps":[
  {"id":"%s","order":0,"text":"氣炸鍋預熱","equipment_type_ids":["air-fryer","not-in-dictionary"],"techniques":["air-fry"]}
 ],"difficulty":{"ingredients":3,"equipment":3,"time":3,"technique":3,"failure_risk":3,"overall":1,"source":"author"}}')$$,
  :'r1', :'s1'), '存食材、步驟與難易度');
select is((select ingredient_ids from public.recipes where id = :'r1'), array['beef-slices', 'cabbage'],
  '食材 ID：依序、不重複，字典裡找不到的不算');
select is((select equipment_type_ids from public.recipes where id = :'r1'), array['air-fryer'], '廚具由步驟彙整');
select is((select techniques from public.recipes where id = :'r1'), array['air-fry'], '手法由步驟彙整');
select is((select difficulty->>'overall' from public.recipes where id = :'r1'), '6', '難易度總分由資料庫算，不信任手機送來的值');
select is((select version from public.recipes where id = :'r1'), 2, '做法改變，版本加一');

select lives_ok(format($$select tests.save('{"id":"%s","story":"阿嬤的味道"}')$$, :'r1'), '只改心得');
select is((select version from public.recipes where id = :'r1'), 2, '改心得不算新版本');
select is((select ingredients->0->>'id' from public.recipes where id = :'r1'), 'i1', '沒送的欄位維持原值');

select lives_ok(format($$select tests.save('{"id":"%s","ai_tags":{"main_ingredient_ids":["cabbage"],"confirmed_by_user":false},
  "ingredients":[{"id":"i9","raw_text":"神秘食材","optional":false}]}')$$, :'r1'),
  '食材都對不到字典');
select is((select ingredient_ids from public.recipes where id = :'r1'), array['cabbage'], '食材對不到字典時用 AI 補的主食材');

-- cooked_on：依廚房時區算一次；又做了一次的日期併進 cooked_dates
select lives_ok(format($$select tests.save('{"id":"%s","cooked_at":"2026-11-18T18:30:00Z",
  "cook_notes":[{"id":"%s","cooked_on":"2026-11-25","text":"少放糖"}]}')$$, :'r1', :'n1'), '存料理時間與又做了一次');
select is((select cooked_on from public.recipes where id = :'r1'), '2026-11-19'::date, 'cooked_on 依廚房時區（台北）算');
select is((select cooked_dates from public.recipes where id = :'r1'), array['2026-11-19', '2026-11-25']::date[],
  'cooked_dates 含又做了一次的日期');
select tests.logout();
update public.kitchens set timezone = 'America/New_York' where id = :'k1';
select tests.login_as(:'owner');
select lives_ok(format($$select tests.save('{"id":"%s","story":"阿嬤的味道，加一句"}')$$, :'r1'), '廚房改了時區之後再存');
select is((select cooked_on from public.recipes where id = :'r1'), '2026-11-19'::date, 'cooked_on 不跟著時區改變');

---------------------------------------------------------------------------
-- 檢查與拒絕
---------------------------------------------------------------------------
select throws_ok(format($$select tests.save(jsonb_build_object('id', '%s', 'title', repeat('字', 81)))$$, :'r1'),
  '22001', null, '標題超過 80 字');
select throws_ok(format($$select tests.save(jsonb_build_object('id', '%s', 'steps',
  jsonb_build_array(jsonb_build_object('id', '%s', 'order', 0, 'text', repeat('字', 501)))))$$, :'r1', :'s1'),
  '22001', null, '步驟超過 500 字');
select throws_ok(format($$select tests.save('{"id":"%s","status":"published"}')$$, :'r1'),
  '22023', null, '狀態不能由手機決定');
select throws_ok(format($$select tests.save('{"id":"%s","version":9}')$$, :'r1'),
  '22023', null, '版本不能由手機決定');
select throws_ok(format($$select tests.save('{"id":"%s","ingredient_ids":["cabbage"]}')$$, :'r1'),
  '22023', null, '衍生欄位不能由手機決定');
select throws_ok(format($$select public.save_recipe('{"id":"%s","story":"x"}', now() - interval '1 day')$$, :'r1'),
  'P0001', 'recipe_conflict', 'updated_at 不一致就拒絕');
select throws_ok(format($$select public.save_recipe('{"id":"%s","story":"x"}')$$, :'r1'),
  'P0001', 'recipe_conflict', '更新一定要帶 updated_at（重送新增也走這裡，由手機重新讀取）');
select throws_ok($$select public.save_recipe('{"id":"00000000-0000-4000-8000-000000000000"}')$$,
  '22023', null, 'ID 不是 UUID v7');
select throws_ok(format($$select tests.save('{"id":"%s","ingredients":[{"id":"x"}]}')$$, :'r1'),
  '23514', null, '食材清單格式不對');
select throws_ok(format($$select tests.save('{"id":"%s","difficulty":{"ingredients":3}}')$$, :'r1'),
  '22023', null, '難易度缺面向');
select throws_ok(format($$select tests.save('{"id":"%s","kitchen_id":"%s"}')$$, :'r1', :'k2'),
  '42501', null, '不能寫別人的廚房');
select throws_ok(format($$insert into public.recipes (id, user_id) values ('%s', '%s')$$, :'r2', :'owner'),
  '42501', null, '不能直接新增');
select throws_ok(format($$update public.recipes set title = 'x' where id = '%s'$$, :'r1'),
  '42501', null, '不能直接修改');
select throws_ok(format($$delete from public.recipes where id = '%s'$$, :'r1'),
  '42501', null, '不能直接刪除');
select throws_ok($$select * from public.app_config$$, '42501', null, 'app_config 不開放給 App');
select tests.logout();

---------------------------------------------------------------------------
-- 可見範圍：草稿只有作者；發佈後依 visibility
---------------------------------------------------------------------------
select tests.login_as(:'mate');
select is((select count(*)::int from public.recipes where id = :'r1'), 0, '草稿，同廚房的人也看不到');
select throws_ok(format($$select tests.save('{"id":"%s","story":"改別人的"}')$$, :'r1'),
  'P0002', null, '不能改別人的食譜');
select throws_ok(format($$select public.publish_recipe('%s')$$, :'r1'), 'P0002', null, '不能發佈別人的食譜');
select throws_ok(format($$select public.delete_recipe('%s')$$, :'r1'), 'P0002', null, '不能刪別人的食譜');
select tests.logout();

select tests.login_as(:'owner');
select lives_ok(format($$select tests.save('{"id":"%s"}')$$, :'r2'), '只有一個 ID 就能建立空白草稿');
select throws_ok(format($$select public.publish_recipe('%s')$$, :'r2'), '22023', null, '沒有標題也沒有照片不能發佈');
select lives_ok(format($$select public.publish_recipe('%s')$$, :'r1'), '有標題就能發佈');
select is((select status from public.recipes where id = :'r1'), 'published', '狀態改成已發佈');
select ok((select published_at is not null from public.recipes where id = :'r1'), '填入發佈時間');
select tests.logout();

select tests.login_as(:'mate');
select is((select count(*)::int from public.recipes where id = :'r1'), 1, '發佈後，同廚房的人（家人）看得到');
select tests.logout();
select tests.login_as(:'stranger');
select is((select count(*)::int from public.recipes where id = :'r1'), 0, '外人看不到（還不是好友）');
select tests.logout();

select tests.login_as(:'owner');
select lives_ok(format($$select tests.save('{"id":"%s","visibility":"private"}')$$, :'r1'), '改成只有自己');
select tests.logout();
select tests.login_as(:'mate');
select is((select count(*)::int from public.recipes where id = :'r1'), 0, '只有自己：家人也看不到');
select tests.logout();
select tests.login_as(:'owner');
select lives_ok(format($$select tests.save('{"id":"%s","visibility":"household"}')$$, :'r1'), '改成家人');
select tests.logout();
select tests.login_as(:'mate');
select is((select count(*)::int from public.recipes where id = :'r1'), 1, '家人看得到');
select tests.logout();
select tests.login_as(:'stranger');
select is((select count(*)::int from public.recipes where id = :'r1'), 0, '家人以外看不到');
select tests.logout();

---------------------------------------------------------------------------
-- 私人資料（recipe_private）：只有作者
---------------------------------------------------------------------------
select tests.login_as(:'owner');
select lives_ok(format($$select tests.save('{"id":"%s"}', '{"diners":[{"type":"text","name":"小美"}],
  "dictation":{"text":"先把菜洗一洗","lang":"zh-TW","at":"2026-11-20T10:00:00Z"}}')$$, :'r1'),
  '同一個交易存私人資料');
select is((select jsonb_array_length(diners) from public.recipe_private where recipe_id = :'r1'), 1, '作者讀得到');
select throws_ok(format($$select tests.save('{"id":"%s"}', '{"diners":[{"type":"robot"}]}')$$, :'r1'),
  '23514', null, '一起吃的人格式不對');
select throws_ok(format($$select tests.save('{"id":"%s"}', '{"other":1}')$$, :'r1'), '22023', null, '私人資料不認得的欄位');
select tests.logout();
select tests.login_as(:'mate');
select is((select count(*)::int from public.recipe_private), 0, '家人讀不到私人資料');
select throws_ok(format($$insert into public.recipe_private (recipe_id, user_id) values ('%s', '%s')$$, :'r1', :'mate'),
  '42501', null, '不能替別人的食譜建立私人資料');
select tests.logout();

---------------------------------------------------------------------------
-- 照片：食譜與步驟
---------------------------------------------------------------------------
update public.app_config set photo_limits = '{"per_recipe": 2, "per_step": 1, "per_cook_note": 1}', max_steps = 2;

select tests.login_as(:'owner');
select throws_ok(format($$select tests.add_photo('%s', '%s', 'recipe', '%s')$$, :'ph1', :'owner', :'r1'),
  '42501', null, '手機不能直接寫食譜照片');
select throws_ok(format($$select tests.add_photo('%s', '%s', 'recipe_step', '%s', '%s')$$, :'ph3', :'owner', :'s1', :'r1'),
  '42501', null, '手機不能直接寫步驟照片');
select lives_ok(format($$select tests.save('{"id":"%s"}', null, '%s')$$, :'r1',
  jsonb_build_array(tests.photo(:'ph1', 'recipe'), tests.photo(:'ph2', 'recipe'), tests.photo(:'ph3', 'recipe_step', :'s1'))),
  '用 p_photos 存上方照片與步驟照片');
select is((select created_by from public.photos where id = :'ph1'), :'owner'::uuid, '由資料庫記下上傳的人');
select is((select id from public.photos where owner_type = 'recipe' and owner_id = :'r1' and is_cover), :'ph1'::uuid, '第一張就是封面');
select is((select array_agg(id order by sort_order) from public.photos where owner_type = 'recipe' and owner_id = :'r1'),
  array[:'ph1', :'ph2']::uuid[], '順序依清單');
select is((select recipe_id from public.photos where id = :'ph3'), :'r1'::uuid, '步驟照片記下所屬的食譜');

select lives_ok(format($$select tests.save('{"id":"%s"}', null, '%s')$$, :'r1',
  jsonb_build_array(tests.photo(:'ph2', 'recipe'), tests.photo(:'ph1', 'recipe'), tests.photo(:'ph3', 'recipe_step', :'s1'))),
  '調換順序');
select is((select id from public.photos where owner_type = 'recipe' and owner_id = :'r1' and is_cover), :'ph2'::uuid, '換順序後封面跟著換');
select is((select count(*)::int from public.photos where owner_type = 'recipe' and owner_id = :'r1' and is_cover), 1, '只有一張封面');

select throws_ok(format($$select tests.save('{"id":"%s"}', null, '%s')$$, :'r1',
  jsonb_build_array(tests.photo(:'ph1', 'recipe'), tests.photo(:'ph2', 'recipe'), tests.photo(:'ph4', 'recipe'))),
  '54000', null, '超過上方照片的張數上限');
select is((select count(*)::int from public.photos where owner_type = 'recipe' and owner_id = :'r1' and cook_note_id is null), 2,
  '超過上限時整批不寫入');
select throws_ok(format($$select tests.save('{"id":"%s"}', null, '%s')$$, :'r1',
  jsonb_build_array(tests.photo(:'ph3', 'recipe_step', :'s1'), tests.photo(:'ph4', 'recipe_step', :'s1'))),
  '54000', null, '一個步驟只能放一張照片');
select throws_ok(format($$select tests.save('{"id":"%s"}', null, '%s')$$, :'r1',
  jsonb_build_array(tests.photo(:'ph3', 'recipe_step', :'s2'))),
  '23503', null, '步驟不存在');
select throws_ok(format($$select tests.save('{"id":"%s"}', null, '{"id":"x"}')$$, :'r1'), '22023', null, 'p_photos 不是陣列');
select throws_ok(format($$select tests.save('{"id":"%s"}', null, '[{"id":"%s","owner_type":"recipe"}]')$$, :'r1', :'ph1'),
  '22023', null, '照片缺寬高');
select throws_ok(format($$select tests.save('{"id":"%s"}', null, '[{"id":"%s","owner_type":"avatar","width":1,"height":1}]')$$, :'r1', :'ph1'),
  '22023', null, '照片類型只能是食譜或步驟');
select throws_ok(format($$select tests.save('{"id":"%s"}', null, '%s')$$, :'r1',
  jsonb_build_array(tests.photo(:'ph1', 'recipe'), tests.photo(:'ph1', 'recipe'))),
  '22023', null, '照片重複');
select throws_ok(format($$select tests.save('{"id":"%s"}', null, '%s')$$, :'r1',
  jsonb_build_array(tests.photo(:'ph10', 'recipe'))),
  '23503', null, '檔案還沒傳完不能建立照片');
select is((select count(*)::int from public.photos where owner_type = 'recipe' and owner_id = :'r1' and cook_note_id is null), 2,
  '失敗的儲存不動照片');
select throws_ok(format($$select tests.save('{"id":"%s","steps":[
  {"id":"%s","order":0,"text":"a"},{"id":"%s","order":1,"text":"b"},{"id":"%s","order":2,"text":"c"}]}')$$,
  :'r1', :'s1', :'s2', :'n1'), '54000', null, '步驟超過上限');

-- 又做了一次的照片維持直接寫
select lives_ok(format($$select tests.add_photo('%s', '%s', 'recipe', '%s', null, '%s')$$, :'ph5', :'owner', :'r1', :'n1'),
  '又做了一次的照片不算在上方照片的上限裡');
select throws_ok(format($$select tests.add_photo('%s', '%s', 'recipe', '%s', null, '%s')$$, :'ph6', :'owner', :'r1', :'n1'),
  '54000', null, '超過每次又做了一次的張數上限');
select throws_ok(format($$select tests.add_photo('%s', '%s', 'recipe', '%s', null, '%s')$$, :'ph6', :'owner', :'r1', :'s2'),
  '23503', null, '又做了一次的記錄不存在');
select throws_ok(format($$update public.photos set cook_note_id = null where id = '%s'$$, :'ph5'),
  '42501', null, '只能改排序與封面');
select lives_ok(format($$select tests.save('{"id":"%s"}', null, '%s')$$, :'r1',
  jsonb_build_array(tests.photo(:'ph2', 'recipe'), tests.photo(:'ph3', 'recipe_step', :'s1'))),
  '清單裡沒有的照片會被刪掉');
select is((select count(*)::int from public.photos where id = :'ph1'), 0, '被移除的照片資料列刪掉了');
select is((select count(*)::int from public.photos where id = :'ph5'), 1, '又做了一次的照片不受影響');
select lives_ok(format($$select tests.save('{"id":"%s"}', null, '%s')$$, :'r1',
  jsonb_build_array(tests.photo(:'ph1', 'recipe'), tests.photo(:'ph2', 'recipe'), tests.photo(:'ph3', 'recipe_step', :'s1'))),
  '復原：同一張照片的檔案還在，可以再加回來');
select lives_ok(format($$select tests.save('{"id":"%s","story":"沒送 p_photos"}')$$, :'r1'), '沒送 p_photos 不動照片');
select is((select count(*)::int from public.photos where owner_type in ('recipe', 'recipe_step') and (owner_id = :'r1' or recipe_id = :'r1')), 4,
  '照片都還在');
select tests.logout();

-- 讀取：家人讀得到（食譜是家人可見）；外人不行
select tests.login_as(:'mate');
select is((select count(*)::int from public.photos where owner_type in ('recipe', 'recipe_step')), 4, '家人讀得到食譜與步驟的照片資料列');
select is((select count(*)::int from storage.objects where bucket_id = 'photos' and name like format('users/%s/%%', :'owner')),
  12, '家人讀得到照片檔案（4 張 × 3 個尺寸）');
select throws_ok(format($$select tests.add_photo('%s', '%s', 'recipe', '%s')$$, :'ph7', :'owner', :'r2'),
  '42501', null, '不能用別人的名義新增照片');
select throws_ok(format($$select tests.save('{"id":"%s"}', null, '%s')$$, :'r1',
  jsonb_build_array(tests.photo(:'ph7', 'recipe'))),
  'P0002', null, '不能把照片掛在別人的食譜上');
select is(tests.updated_rows(format($$delete from public.photos where id = '%s'$$, :'ph1')), 0, '家人刪不掉');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('photos', 'users/%s/%s.webp')$$, :'owner', :'ph8'),
  '42501', null, '家人不能寫別人路徑的檔案');
select tests.logout();

select tests.login_as(:'stranger');
select is((select count(*)::int from public.photos where owner_type in ('recipe', 'recipe_step')), 0, '外人讀不到照片資料列');
select is((select count(*)::int from storage.objects where bucket_id = 'photos' and name like format('users/%s/%%', :'owner')),
  0, '外人讀不到照片檔案');
select tests.logout();

-- 食譜改成只有自己之後，家人連照片也讀不到
select tests.login_as(:'owner');
select lives_ok(format($$select tests.save('{"id":"%s","visibility":"private"}')$$, :'r1'), '改回只有自己');
select tests.logout();
select tests.login_as(:'mate');
select is((select count(*)::int from storage.objects where bucket_id = 'photos' and name like format('users/%s/%%', :'owner')),
  0, '只有自己的食譜，照片檔案家人也讀不到');
select tests.logout();

-- 步驟被刪掉時，那一步的照片資料列一起刪
select tests.login_as(:'owner');
select lives_ok(format($$select tests.save('{"id":"%s","steps":[]}')$$, :'r1'), '清空步驟');
select is((select count(*)::int from public.photos where owner_type = 'recipe_step'), 0, '步驟照片資料列跟著刪掉');

-- 只有照片也能發佈
select lives_ok(format($$select tests.save('{"id":"%s"}')$$, :'r3'), '另一篇草稿');
select lives_ok(format($$select tests.save('{"id":"%s"}', null, '%s')$$, :'r3', jsonb_build_array(tests.photo(:'ph8', 'recipe'))), '只放一張照片');
select lives_ok(format($$select public.publish_recipe('%s')$$, :'r3'), '只有照片也能發佈');

---------------------------------------------------------------------------
-- 刪除與復原
---------------------------------------------------------------------------
select lives_ok(format($$select public.delete_recipe('%s')$$, :'r3'), '刪除（軟刪除）');
select ok((select deleted_at is not null from public.recipes where id = :'r3'), '作者還看得到，可以復原');
select throws_ok(format($$select tests.save('{"id":"%s","story":"x"}')$$, :'r3'), 'P0002', null, '已刪除的不能再存');
select throws_ok(format($$select tests.save('{"id":"%s"}', null, '%s')$$, :'r3', jsonb_build_array(tests.photo(:'ph9', 'recipe'))),
  'P0002', null, '已刪除的食譜不能新增照片');
select tests.logout();

select tests.login_as(:'mate');
select is((select count(*)::int from public.recipes where id = :'r3'), 0, '刪除後別人看不到');
select tests.logout();

select tests.login_as(:'owner');
select lives_ok(format($$select public.restore_recipe('%s')$$, :'r3'), '復原');
select is((select deleted_at from public.recipes where id = :'r3'), null, '復原後沒有刪除時間');
select lives_ok(format($$select public.delete_recipe('%s')$$, :'r3'), '再刪一次');
select tests.logout();

update public.recipes set deleted_at = now() - interval '31 days' where id = :'r3';
select tests.login_as(:'owner');
select throws_ok(format($$select public.restore_recipe('%s')$$, :'r3'), 'P0002', null, '超過保留期限不能復原');
select tests.logout();
select is(private.purge_deleted_recipes(), 1, '到期後維護工作真正刪除');
select is((select count(*)::int from public.photos where owner_id = :'r3'), 0, '照片資料列跟著刪掉');

-- 停用的帳號不能寫
update public.user_profiles set status = 'suspended' where user_id = :'owner';
select tests.login_as(:'owner');
select throws_ok(format($$select tests.save('{"id":"%s","story":"x"}')$$, :'r1'), '42501', null, '停用的帳號不能儲存食譜');
select tests.logout();

select * from finish();
rollback;
