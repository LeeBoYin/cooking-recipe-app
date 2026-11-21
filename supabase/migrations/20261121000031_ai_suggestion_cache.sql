-- 大廚的點子（M1a-06；05 AiSuggestionCache、16 第三、六節）。
-- ai_suggestion_cache：上次的點子，換手機也看得到；只有本人能讀，只由 ai 函式（service_role）寫。
-- 首頁（kind = 'home'）每次產生一筆；「換一組」是同一個 6 小時內的下一輪（round 1、2）。
-- drafts（展開做法，M1a-09）與 feedback（不想要、收藏，M1a-10）先留好欄位，這一段不寫。
-- ai_home_context：ai 函式要算候選時一次讀齊的資料（只給 service_role）。

create table public.ai_suggestion_cache (
  id uuid primary key check (private.is_uuid_v7(id)),
  user_id uuid not null references auth.users (id) on delete cascade,
  kitchen_id uuid references public.kitchens (id) on delete set null,
  kind text not null check (kind in ('home', 'chat', 'easter_egg', 'observation')),
  -- 食材狀態、口味、廚具、地區、月份、時段、語言的雜湊；沒變就不重算
  input_hash text not null check (char_length(input_hash) between 8 and 64),
  -- 同一個 6 小時內的第幾輪：0 是第一次產生，「換一組」加一，最多 2 次
  round smallint not null default 0 check (round between 0 and 2),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- 結構化輸出（點子卡片，不含做法），格式由 ai 函式檢查
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  drafts jsonb not null default '{}' check (jsonb_typeof(drafts) = 'object'),
  feedback jsonb not null default '[]' check (jsonb_typeof(feedback) = 'array'),
  check (expires_at > created_at)
);

create index ai_suggestion_cache_latest on public.ai_suggestion_cache (user_id, kind, created_at desc);

alter table public.ai_suggestion_cache enable row level security;
revoke all on public.ai_suggestion_cache from anon, authenticated;
grant select on public.ai_suggestion_cache to authenticated;

create policy "本人讀自己的點子" on public.ai_suggestion_cache
  for select to authenticated using (user_id = (select auth.uid()));

---------------------------------------------------------------------------
-- 飲食限制（過敏原、飲食原則、不吃的食物、不用料理酒）一改，這個人的點子快取全部作廢：
-- 手機打開首頁會先顯示上次的點子，不能讓剛加了過敏原的人看到舊的點子。
---------------------------------------------------------------------------
create function private.dietary_clears_ai_cache()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.ai_suggestion_cache where user_id = new.user_id;
  return new;
end;
$$;

create trigger dietary_clears_ai_cache after update on public.dietary_profiles
  for each row when (
    old.allergen_ids is distinct from new.allergen_ids
    or old.dietary_restriction_ids is distinct from new.dietary_restriction_ids
    or old.dislike_ingredient_ids is distinct from new.dislike_ingredient_ids
    or old.no_cooking_alcohol is distinct from new.no_cooking_alcohol
  ) execute function private.dietary_clears_ai_cache();

---------------------------------------------------------------------------
-- ai_home_context：算首頁點子要用的資料，一次讀齊
---------------------------------------------------------------------------
create function public.ai_home_context(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.user_settings;
  v_kitchen public.kitchens;
begin
  select * into v_settings from public.user_settings where user_id = p_user;
  if not found then
    return null;
  end if;

  -- 現在的廚房；設定裡的廚房不在了就取最早加入的（和手機一致）
  select k.* into v_kitchen
  from public.kitchen_members m
  join public.kitchens k on k.id = m.kitchen_id
  where m.user_id = p_user and m.left_at is null and k.deleted_at is null
  order by (k.id = v_settings.current_kitchen_id) desc, m.joined_at
  limit 1;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'kitchen', jsonb_build_object('id', v_kitchen.id, 'region', v_kitchen.region, 'timezone', v_kitchen.timezone),
    'settings', jsonb_build_object('locale', v_settings.locale, 'chef_persona', v_settings.chef_persona),
    'taste', (
      select jsonb_build_object('dims', pp.dims, 'context', pp.context)
      from public.preference_profiles pp where pp.user_id = p_user
    ),
    'dietary', (
      select jsonb_build_object(
        'allergen_ids', d.allergen_ids,
        'restriction_ids', d.dietary_restriction_ids,
        'dislike_ingredient_ids', d.dislike_ingredient_ids,
        'no_cooking_alcohol', d.no_cooking_alcohol)
      from public.dietary_profiles d where d.user_id = p_user
    ),
    'pantry', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ingredient_id', i.ingredient_id,
        'want_to_use_soon', i.want_to_use_soon,
        'expires_at', i.expires_at))
      from public.pantry_items i
      where i.kitchen_id = v_kitchen.id and i.status = 'active' and i.ingredient_id is not null
    ), '[]'),
    'equipment', coalesce((
      select jsonb_agg(jsonb_build_object(
        'equipment_type_id', e.equipment_type_id,
        'enabled_optional_techniques', e.enabled_optional_techniques))
      from public.kitchen_equipment e where e.kitchen_id = v_kitchen.id
    ), '[]'),
    -- 只取最近的 200 篇已發佈食譜；自己的食譜才算
    'recipes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'ingredient_ids', r.ingredient_ids,
        'ingredients', r.ingredients,
        'highlights', r.highlights,
        'cooked_dates', r.cooked_dates,
        'cooked_at', r.cooked_at,
        'published_at', r.published_at,
        'difficulty', r.difficulty))
      from (
        select * from public.recipes
        where user_id = p_user and status = 'published' and deleted_at is null
        order by published_at desc
        limit 200
      ) r
    ), '[]'),
    -- 最近的首頁點子（同一個 6 小時內的幾輪，最新的在前）
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'input_hash', c.input_hash,
        'round', c.round,
        'created_at', c.created_at,
        'expires_at', c.expires_at,
        'payload', c.payload) order by c.created_at desc)
      from (
        select * from public.ai_suggestion_cache
        where user_id = p_user and kind = 'home' and created_at > now() - interval '12 hours'
        order by created_at desc
        limit 4
      ) c
    ), '[]')
  );
end;
$$;

---------------------------------------------------------------------------
-- ai_home_cache_save：存一輪點子；每人的首頁點子只留最近 6 筆
---------------------------------------------------------------------------
create function public.ai_home_cache_save(
  p_user uuid, p_kitchen uuid, p_input_hash text, p_round smallint, p_payload jsonb, p_ttl_hours integer default 24
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := private.uuid_v7();
begin
  insert into public.ai_suggestion_cache (id, user_id, kitchen_id, kind, input_hash, round, expires_at, payload)
    values (v_id, p_user, p_kitchen, 'home', p_input_hash, p_round, now() + make_interval(hours => p_ttl_hours), p_payload);
  delete from public.ai_suggestion_cache
  where user_id = p_user and kind = 'home'
    and id not in (
      select id from public.ai_suggestion_cache
      where user_id = p_user and kind = 'home' order by created_at desc limit 6
    );
  return v_id;
end;
$$;

revoke execute on function public.ai_home_context(uuid) from public, anon, authenticated;
revoke execute on function public.ai_home_cache_save(uuid, uuid, text, smallint, jsonb, integer) from public, anon, authenticated;
grant execute on function public.ai_home_context(uuid) to service_role;
grant execute on function public.ai_home_cache_save(uuid, uuid, text, smallint, jsonb, integer) to service_role;
