-- 從網址匯入的來源（M1b-05）：recipes.source 的 url 只允許 http／https，可帶網站名稱；匯入的食譜可見範圍不鎖
begin;
select plan(7);

select tests.create_user('owner@zhusha.test') as owner \gset
select private.uuid_v7() as r1 \gset
select private.uuid_v7() as r2 \gset
select tests.login_as(:'owner');

select lives_ok(
  format($$select public.save_recipe('{"id":"%s","title":"烤雞","source":{"type":"url","url":"https://example.com/r?a=1","name":"Example Kitchen"}}'::jsonb, null)$$, :'r1'),
  '來源網址與網站名稱可以存');
select is((select source from public.recipes where id = :'r1'), '{"type":"url","url":"https://example.com/r?a=1","name":"Example Kitchen"}'::jsonb, '存進 source');

select throws_ok(
  format($$select public.save_recipe('{"id":"%s","title":"x","source":{"type":"url","url":"javascript:alert(1)"}}'::jsonb, null)$$, :'r2'),
  null, null, 'javascript: 不行');
select throws_ok(
  format($$select public.save_recipe('{"id":"%s","title":"x","source":{"type":"url","url":"file:///etc/passwd"}}'::jsonb, null)$$, :'r2'),
  null, null, 'file: 不行');
select throws_ok(
  format($$select public.save_recipe('{"id":"%s","title":"x","source":{"type":"url","url":"https://a.com","name":"%s"}}'::jsonb, null)$$, :'r2', repeat('字', 61)),
  null, null, '網站名稱最多 60 字');
select throws_ok(
  format($$select public.save_recipe('{"id":"%s","title":"x","source":{"type":"url","url":"https://a.com","extra":1}}'::jsonb, null)$$, :'r2'),
  null, null, '不能有多餘的欄位');

select lives_ok(
  format($$select public.save_recipe('{"id":"%s","visibility":"friends"}'::jsonb, (select updated_at from public.recipes where id = '%s'))$$, :'r1', :'r1'),
  '匯入的食譜可以設成好友看得到（可見範圍不鎖）');

select * from finish();
rollback;
