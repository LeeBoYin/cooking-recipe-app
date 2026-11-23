-- 靈感彩蛋（M1b-04c；02、03、05、16）。
-- 彩蛋存在 ai_suggestion_cache（kind = 'easter_egg'），和大廚的點子一樣可以展開做法、收藏。
-- app_config.inspiration_egg_per_week：每人滾動 7 天最多幾次（0 = 關閉）。
-- ai_egg_state：ai 函式決定要不要產生彩蛋時一次讀齊的資料（只給 service_role）。
-- ai_egg_save：存一個彩蛋；每人只留最近 7 筆。

alter table public.app_config
  add column inspiration_egg_per_week smallint not null default 1 check (inspiration_egg_per_week between 0 and 7);
comment on column public.app_config.inspiration_egg_per_week is
  '靈感彩蛋：每人滾動 7 天最多出現幾次（0 = 關閉）。';

---------------------------------------------------------------------------
-- ai_egg_state：上限、7 天內出現過幾次、最近一個彩蛋、最近 14 天的點子（首頁、對話、彩蛋）用過的食材與廚具
---------------------------------------------------------------------------
create function public.ai_egg_state(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'per_week', (select c.inspiration_egg_per_week from public.app_config c),
    'count_7d', (
      select count(*) from public.ai_suggestion_cache
      where user_id = p_user and kind = 'easter_egg' and created_at > now() - interval '7 days'
    ),
    'latest', (
      select jsonb_build_object('id', e.id, 'created_at', e.created_at, 'expires_at', e.expires_at, 'payload', e.payload)
      from public.ai_suggestion_cache e
      where e.user_id = p_user and e.kind = 'easter_egg'
      order by e.created_at desc
      limit 1
    ),
    'used_ingredient_ids', (
      select coalesce(jsonb_agg(distinct t.x), '[]'::jsonb) from (
        select u.x
        from public.ai_suggestion_cache c
        cross join lateral jsonb_array_elements(case when jsonb_typeof(c.payload -> 'ideas') = 'array' then c.payload -> 'ideas' else '[]'::jsonb end) i
        cross join lateral jsonb_array_elements_text(case when jsonb_typeof(i -> 'usesPantryIds') = 'array' then i -> 'usesPantryIds' else '[]'::jsonb end) u(x)
        where c.user_id = p_user and c.kind in ('home', 'chat', 'easter_egg') and c.created_at > now() - interval '14 days'
        union
        select o ->> 'ingredientId'
        from public.ai_suggestion_cache c
        cross join lateral jsonb_array_elements(case when jsonb_typeof(c.payload -> 'ideas') = 'array' then c.payload -> 'ideas' else '[]'::jsonb end) i
        cross join lateral jsonb_array_elements(case when jsonb_typeof(i -> 'otherIngredients') = 'array' then i -> 'otherIngredients' else '[]'::jsonb end) o
        where c.user_id = p_user and c.kind in ('home', 'chat', 'easter_egg') and c.created_at > now() - interval '14 days'
          and o ->> 'ingredientId' is not null
      ) t
    ),
    'used_equipment_ids', (
      select coalesce(jsonb_agg(distinct u.x), '[]'::jsonb)
      from public.ai_suggestion_cache c
      cross join lateral jsonb_array_elements(case when jsonb_typeof(c.payload -> 'ideas') = 'array' then c.payload -> 'ideas' else '[]'::jsonb end) i
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(i -> 'equipment') = 'array' then i -> 'equipment' else '[]'::jsonb end) u(x)
      where c.user_id = p_user and c.kind in ('home', 'chat', 'easter_egg') and c.created_at > now() - interval '14 days'
    )
  );
$$;

---------------------------------------------------------------------------
-- ai_egg_save：存一個彩蛋；每人的彩蛋只留最近 7 筆（上限最多是每週 7 次）
---------------------------------------------------------------------------
create function public.ai_egg_save(p_user uuid, p_kitchen uuid, p_input_hash text, p_payload jsonb, p_ttl_hours integer default 24)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := private.uuid_v7();
begin
  insert into public.ai_suggestion_cache (id, user_id, kitchen_id, kind, input_hash, round, expires_at, payload)
    values (v_id, p_user, p_kitchen, 'easter_egg', p_input_hash, 0, now() + make_interval(hours => p_ttl_hours), p_payload);
  delete from public.ai_suggestion_cache
  where user_id = p_user and kind = 'easter_egg'
    and id not in (
      select id from public.ai_suggestion_cache
      where user_id = p_user and kind = 'easter_egg' order by created_at desc limit 7
    );
  return v_id;
end;
$$;

revoke execute on function public.ai_egg_state(uuid) from public, anon, authenticated;
revoke execute on function public.ai_egg_save(uuid, uuid, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.ai_egg_state(uuid) to service_role;
grant execute on function public.ai_egg_save(uuid, uuid, text, jsonb, integer) to service_role;
