-- 食譜版本（M1b-02）：只有已發佈的食譜留版本、最多 20 版、改心得不留、還原寫成新的一版、只有作者讀得到
begin;
select plan(31);

create function tests.save(p jsonb, p_changed_by text default 'author')
returns public.recipes
language plpgsql
as $$
declare
  v_updated timestamptz;
begin
  select updated_at into v_updated from public.recipes where id = (p->>'id')::uuid;
  return public.save_recipe(p, v_updated, null, null, p_changed_by);
end;
$$;
create function tests.restore(p_id uuid, p_version integer)
returns public.recipes
language plpgsql
as $$
declare
  v_updated timestamptz;
begin
  select updated_at into v_updated from public.recipes where id = p_id;
  return public.restore_recipe_revision(p_id, p_version, v_updated);
end;
$$;
grant execute on function tests.save(jsonb, text), tests.restore(uuid, integer) to authenticated;

select tests.create_user('owner@zhusha.test') as owner \gset
select tests.create_user('stranger@zhusha.test') as stranger \gset
select private.uuid_v7() as r1 \gset
select private.uuid_v7() as ph1 \gset
insert into storage.objects (bucket_id, name) values
  ('photos', format('users/%s/%s.webp', :'owner', :'ph1')),
  ('photos', format('users/%s/%s_feed.webp', :'owner', :'ph1')),
  ('photos', format('users/%s/%s_thumb.webp', :'owner', :'ph1'));

select tests.login_as(:'owner');

-- 草稿不留版本
select lives_ok(format($$select tests.save('{"id":"%s","title":"紅燒肉","tips":"v-a"}')$$, :'r1'), '新增草稿');
select lives_ok(format($$select tests.save('{"id":"%s","tips":"v-b"}')$$, :'r1'), '草稿改做法');
select is((select count(*)::int from public.recipe_revisions where recipe_id = :'r1'), 0, '草稿不留版本');

-- 發佈留下第一版
select lives_ok(format($$select public.save_recipe('{"id":"%s"}', (select updated_at from public.recipes where id = '%s'), null,
  jsonb_build_array(jsonb_build_object('id', '%s', 'owner_type', 'recipe', 'width', 1200, 'height', 900)))$$, :'r1', :'r1', :'ph1'), '補照片');
select lives_ok(format($$select public.publish_recipe('%s')$$, :'r1'), '發佈');
select is((select count(*)::int from public.recipe_revisions where recipe_id = :'r1'), 1, '發佈時留下第一版');
select is((select snapshot->>'tips' from public.recipe_revisions where recipe_id = :'r1'), 'v-b', '第一版是發佈當下的做法');
select is((select version from public.recipe_revisions where recipe_id = :'r1'), (select version from public.recipes where id = :'r1'),
  '版號對應食譜的版本');
select is((select changed_by from public.recipe_revisions where recipe_id = :'r1'), 'author', '發佈那一版是作者');

-- 已發佈：改做法留一版；改心得、照片不留
select lives_ok(format($$select tests.save('{"id":"%s","tips":"v-c"}')$$, :'r1'), '已發佈，改料理筆記');
select is((select count(*)::int from public.recipe_revisions where recipe_id = :'r1'), 2, '改做法留一版');
select is((select snapshot->>'tips' from public.recipe_revisions where recipe_id = :'r1' order by version desc limit 1), 'v-c',
  '新的一版是改完的內容');
select lives_ok(format($$select tests.save('{"id":"%s","story":"阿嬤的味道"}')$$, :'r1'), '改心得');
select lives_ok(format($$select tests.save('{"id":"%s","tips":"v-c"}')$$, :'r1'), '做法沒變地存一次');
select is((select count(*)::int from public.recipe_revisions where recipe_id = :'r1'), 2, '改心得、做法沒變都不留版本');
select lives_ok(format($$select tests.save('{"id":"%s","tips":"v-d"}', 'ai_dictation')$$, :'r1'), 'changed_by 帶 ai_dictation');
select is((select changed_by from public.recipe_revisions where recipe_id = :'r1' order by version desc limit 1), 'ai_dictation',
  'changed_by 記下來');
select throws_ok(format($$select tests.save('{"id":"%s","tips":"x"}', 'someone')$$, :'r1'), '22023', null, 'changed_by 不合法就拒絕');

-- 還原＝舊版內容寫成新的一版
select lives_ok(format($$select tests.restore('%s', (select min(version) from public.recipe_revisions where recipe_id = '%s'))$$, :'r1', :'r1'),
  '還原成第一版');
select is((select tips from public.recipes where id = :'r1'), 'v-b', '食譜變回舊內容');
select is((select count(*)::int from public.recipe_revisions where recipe_id = :'r1'), 4, '還原多一版');
select is((select max(version) from public.recipe_revisions where recipe_id = :'r1'), (select version from public.recipes where id = :'r1'),
  '新的版號只增不減');
select is((select snapshot->>'tips' from public.recipe_revisions where recipe_id = :'r1' order by version desc limit 1), 'v-b',
  '新的一版是舊內容');
select throws_ok(format($$select public.restore_recipe_revision('%s', 999, now())$$, :'r1'), 'P0002', null, '沒有這一版');

-- 最多 20 版：超過刪最舊的
select tests.save(format('{"id":"%s","tips":"n%s"}', :'r1', g)::jsonb) from generate_series(1, 20) g;
select is((select count(*)::int from public.recipe_revisions where recipe_id = :'r1'), 20, '最多留 20 版');
select is((select max(version) from public.recipe_revisions where recipe_id = :'r1'), (select version from public.recipes where id = :'r1'),
  '留下的是最近的');
select is((select min(version) from public.recipe_revisions where recipe_id = :'r1'), (select version - 19 from public.recipes where id = :'r1'),
  '最舊的被刪掉');

-- 權限
select throws_ok(format($$insert into public.recipe_revisions (recipe_id, user_id, version, snapshot, changed_by)
  values ('%s', '%s', 999, '{}', 'author')$$, :'r1', :'owner'), '42501', null, '手機不能直接新增版本');
select throws_ok(format($$delete from public.recipe_revisions where recipe_id = '%s'$$, :'r1'), '42501', null, '手機不能直接刪版本');
select tests.logout();

select tests.login_as(:'stranger');
select is((select count(*)::int from public.recipe_revisions), 0, '別人讀不到版本');
select throws_ok(format($$select public.restore_recipe_revision('%s', 1, now())$$, :'r1'), 'P0002', null, '別人不能還原');
select tests.logout();

select * from finish();
rollback;
