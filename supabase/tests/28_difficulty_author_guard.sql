-- 作者動過的難易度（M1b-03）：AI 不能再覆寫；作者自己改、清掉都照常；AI 估的可以被 AI 重估
begin;
select plan(7);

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
select private.uuid_v7() as r1 \gset
select tests.login_as(:'owner');

-- AI 估的難易度
select public.save_recipe(format('{"id":"%s","title":"炒蛋","difficulty":{"ingredients":1,"equipment":1,"time":1,"technique":2,"failure_risk":1,"overall":1,"source":"ai","estimated_from":"text"}}', :'r1')::jsonb, null);
select is((select difficulty->>'source' from public.recipes where id = :'r1'), 'ai', '新食譜可以存 AI 估的難易度');

select lives_ok(
  format($$select tests.save('{"id":"%s","difficulty":{"ingredients":2,"equipment":1,"time":1,"technique":2,"failure_risk":1,"overall":1,"source":"ai","estimated_from":"recipe"}}'::jsonb)$$, :'r1'),
  'AI 估的可以被 AI 重估');
select is((select difficulty->>'ingredients' from public.recipes where id = :'r1'), '2', '重估有生效');

-- 作者調整
select tests.save(format('{"id":"%s","difficulty":{"ingredients":4,"equipment":3,"time":3,"technique":4,"failure_risk":3,"overall":1,"source":"author"}}', :'r1')::jsonb);
select is((select difficulty->>'source' from public.recipes where id = :'r1'), 'author', '作者調整後是 author');

-- AI 想覆寫：維持作者的
select tests.save(format('{"id":"%s","difficulty":{"ingredients":1,"equipment":1,"time":1,"technique":1,"failure_risk":1,"overall":1,"source":"ai"}}', :'r1')::jsonb);
select is((select difficulty->>'ingredients' from public.recipes where id = :'r1'), '4', 'AI 不能覆寫作者的難易度');
select is((select difficulty->>'overall' from public.recipes where id = :'r1'), '6', '總分也維持作者的');

-- 作者可以清掉
select tests.save(format('{"id":"%s","difficulty":null}', :'r1')::jsonb);
select is((select difficulty from public.recipes where id = :'r1'), null, '作者可以清掉難易度');

select * from finish();
rollback;
