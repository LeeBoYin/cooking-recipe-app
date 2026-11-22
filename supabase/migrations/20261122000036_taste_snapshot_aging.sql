-- M1a-10a 修正：口味快照超過 30 天沒重算也當作過期（隱含訊號隨時間變輕才會發生；core 的 SNAPSHOT_MAX_AGE_DAYS 同一個天數）。
-- 重建 ai_home_context：taste_snapshot 的 stale 已含這一項，並多回傳 computed_at。

create or replace function public.ai_home_context(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.user_settings;
  v_kitchen public.kitchens;
  v_snapshot public.taste_profile_snapshots;
  v_need boolean;
  v_stale boolean;
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

  -- 口味檔案的快照：不存在或過期就一併回傳重算要用的原始資料（ai 函式用 core 重算再存回去）
  select * into v_snapshot from public.taste_profile_snapshots where user_id = p_user;
  -- 超過 30 天沒重算的也當過期，隱含訊號隨時間變輕才會發生（core 的 SNAPSHOT_MAX_AGE_DAYS 同一個天數）
  v_stale := v_snapshot.stale or v_snapshot.computed_at < now() - interval '30 days';
  v_need := v_snapshot.user_id is null or v_stale;

  return jsonb_build_object(
    'read_at', now(),
    'kitchen', jsonb_build_object('id', v_kitchen.id, 'region', v_kitchen.region, 'timezone', v_kitchen.timezone),
    'settings', jsonb_build_object('locale', v_settings.locale, 'chef_persona', v_settings.chef_persona),
    'taste', (
      select jsonb_build_object('dims', pp.dims, 'context', pp.context)
      from public.preference_profiles pp where pp.user_id = p_user
    ),
    'taste_snapshot', case when v_snapshot.user_id is null then null
      else jsonb_build_object('stale', v_stale, 'computed_at', v_snapshot.computed_at, 'data', v_snapshot.data) end,
    'taste_inputs', case when not v_need then null else jsonb_build_object(
      -- 收藏的點子（還在收藏裡的）；cooked：已經從這個收藏記錄了自己的版本
      'saved', coalesce((
        select jsonb_agg(jsonb_build_object(
          'base_dish_id', b.idea ->> 'baseDishId',
          'ingredient_ids', b.idea_ingredient_ids,
          'cooked', b.cooked_recipe_id is not null,
          'at', b.created_at) order by b.created_at desc)
        from (
          select * from public.bookmarks
          where user_id = p_user and kind = 'chef_idea' and deleted_at is null
          order by created_at desc limit 200
        ) b
      ), '[]'),
      -- 對話裡說的偏好（每段對話最後一則訊息的時間當作發生的時間）
      'signals', coalesce((
        select jsonb_agg(jsonb_build_object('at', c.last_message_at, 'signals', c.preference_signals) order by c.last_message_at desc)
        from (
          select * from public.chef_conversations
          where user_id = p_user and preference_signals <> '[]'::jsonb
          order by last_message_at desc limit 50
        ) c
      ), '[]')
    ) end,
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

revoke execute on function public.ai_home_context(uuid) from public, anon, authenticated;
grant execute on function public.ai_home_context(uuid) to service_role;
