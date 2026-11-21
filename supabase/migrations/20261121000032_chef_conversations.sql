-- 和大廚聊聊 ①（M1a-07；05 ChefConversation、16 第三、六節）。
-- chef_conversations：一段對話一列，只有本人能讀；messages 只由 ai 函式經 ai_chat_append 在同一個動作中附加
--   「使用者的話＋大廚的回應」，手機不能直接改（兩台裝置同時送也不會互相蓋掉）。保留 30 天，由每日維護刪除。
-- ai_suggestion_cache.conversation_id：對話裡每一則大廚回應附的點子（kind = 'chat'），跟著對話一起刪。
-- bookmarks：AI 想的點子也能收藏（沒有 baseDishId，用 suggestionId＋菜名判斷重複），新增 bookmark_ai_idea。

create table public.chef_conversations (
  id uuid primary key check (private.is_uuid_v7(id)),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 對話時所在的廚房（決定用哪個廚房的食材與廚具）；廚房刪了就空著
  kitchen_id uuid references public.kitchens (id) on delete set null,
  lang text not null default 'zh-Hant-TW',
  -- 大廚整理的條件摘要，給之後的回合用；20 輪上限開新的一段時，新的一段從舊的摘要開始
  summary text check (char_length(summary) <= 300),
  turn_count smallint not null default 0 check (turn_count between 0 and 20),
  messages jsonb not null default '[]' check (extensions.jsonb_matches_schema(
    '{
      "type": "array",
      "maxItems": 40,
      "items": {
        "type": "object",
        "required": ["id", "role", "text", "at"],
        "properties": {
          "id": { "type": "string" },
          "role": { "enum": ["user", "chef"] },
          "text": { "type": "string", "minLength": 1, "maxLength": 2000 },
          "ask": { "type": "string", "maxLength": 300 },
          "suggestionId": { "type": "string" },
          "at": { "type": "string" }
        },
        "additionalProperties": false
      }
    }'::json, messages)),
  -- 對話中說的、不在食材裡的食材：只用在這段對話，不寫進食材
  mentioned_ingredients jsonb not null default '[]' check (jsonb_typeof(mentioned_ingredients) = 'array'),
  -- 從對話學口味（M1a-10 才算進口味）：先存下來
  preference_signals jsonb not null default '[]' check (jsonb_typeof(preference_signals) = 'array'),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index chef_conversations_latest on public.chef_conversations (user_id, last_message_at desc);

alter table public.chef_conversations enable row level security;
revoke all on public.chef_conversations from anon, authenticated;
grant select on public.chef_conversations to authenticated;

create policy "本人讀自己的對話" on public.chef_conversations
  for select to authenticated using (user_id = (select auth.uid()));

alter table public.ai_suggestion_cache
  add column conversation_id uuid references public.chef_conversations (id) on delete cascade;
create index ai_suggestion_cache_conversation on public.ai_suggestion_cache (conversation_id) where conversation_id is not null;

---------------------------------------------------------------------------
-- ai_chat_get：ai 函式要接著聊時讀這段對話（只給 service_role）。不是本人的、不存在的都回空
---------------------------------------------------------------------------
create function public.ai_chat_get(p_user uuid, p_conversation uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'kitchen_id', c.kitchen_id,
    'summary', c.summary,
    'turn_count', c.turn_count,
    'messages', c.messages,
    'mentioned_ingredients', c.mentioned_ingredients,
    'last_message_at', c.last_message_at,
    -- 每則大廚回應附的點子（給下一輪「已經給過的不要再給」）
    'suggestions', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'payload', s.payload) order by s.created_at)
      from public.ai_suggestion_cache s where s.conversation_id = c.id
    ), '[]')
  )
  from public.chef_conversations c
  where c.id = p_conversation and c.user_id = p_user;
$$;

---------------------------------------------------------------------------
-- ai_chat_append：同一個動作附加「使用者的話＋大廚的回應」。
-- p_conversation 空的就開新的一段（p_carry_summary 是上一段的條件摘要）；滿 20 輪的不能再加（conversation_full）。
---------------------------------------------------------------------------
create function public.ai_chat_append(
  p_user uuid,
  p_kitchen uuid,
  p_conversation uuid,
  p_carry_summary text,
  p_lang text,
  p_user_text text,
  p_chef_text text,
  p_ask text,
  p_ideas jsonb,
  p_model text,
  p_summary text,
  p_mentioned jsonb,
  p_signals jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.chef_conversations;
  v_suggestion uuid;
  v_user_msg jsonb;
  v_chef_msg jsonb;
  v_now timestamptz := now();
  v_mentioned jsonb;
begin
  if p_conversation is null then
    insert into public.chef_conversations (id, user_id, kitchen_id, lang, summary)
      values (private.uuid_v7(), p_user, p_kitchen, coalesce(p_lang, 'zh-Hant-TW'), nullif(btrim(coalesce(p_carry_summary, '')), ''))
      returning * into v_conv;
  else
    select * into v_conv from public.chef_conversations where id = p_conversation and user_id = p_user for update;
    if not found then
      raise exception 'conversation_not_found' using errcode = 'P0002';
    end if;
    if v_conv.turn_count >= 20 then
      raise exception 'conversation_full' using errcode = '23514';
    end if;
  end if;

  if p_ideas is not null and jsonb_typeof(p_ideas) = 'array' and jsonb_array_length(p_ideas) > 0 then
    v_suggestion := private.uuid_v7();
    insert into public.ai_suggestion_cache (id, user_id, kitchen_id, kind, input_hash, round, expires_at, payload, conversation_id)
      values (
        v_suggestion, p_user, v_conv.kitchen_id, 'chat', replace(v_conv.id::text, '-', ''), 0, v_now + interval '30 days',
        jsonb_build_object('schemaVersion', 1, 'ideas', p_ideas, 'chefComment', null, 'model', p_model), v_conv.id);
  end if;

  v_user_msg := jsonb_build_object('id', private.uuid_v7(), 'role', 'user', 'text', p_user_text, 'at', v_now);
  v_chef_msg := jsonb_strip_nulls(jsonb_build_object(
    'id', private.uuid_v7(), 'role', 'chef', 'text', p_chef_text,
    'ask', nullif(btrim(coalesce(p_ask, '')), ''),
    'suggestionId', v_suggestion, 'at', v_now));

  -- 說過的食材：同一段話裡同樣的字只留一筆，最多 30 筆
  select coalesce(jsonb_agg(m order by ord), '[]') into v_mentioned
  from (
    select distinct on (m ->> 'text') m, ord
    from jsonb_array_elements(v_conv.mentioned_ingredients || coalesce(p_mentioned, '[]')) with ordinality as t(m, ord)
    order by m ->> 'text', ord
    limit 30
  ) d;

  update public.chef_conversations set
    messages = messages || jsonb_build_array(v_user_msg, v_chef_msg),
    turn_count = turn_count + 1,
    summary = coalesce(nullif(btrim(coalesce(p_summary, '')), ''), summary),
    mentioned_ingredients = v_mentioned,
    preference_signals = preference_signals || coalesce(p_signals, '[]'),
    last_message_at = v_now
  where id = v_conv.id
  returning * into v_conv;

  return jsonb_build_object(
    'conversation_id', v_conv.id,
    'turn_count', v_conv.turn_count,
    'user_message', v_user_msg,
    'chef_message', v_chef_msg,
    'suggestion_id', v_suggestion);
end;
$$;

revoke execute on function public.ai_chat_get(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ai_chat_append(uuid, uuid, uuid, text, text, text, text, text, jsonb, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.ai_chat_get(uuid, uuid) to service_role;
grant execute on function public.ai_chat_append(uuid, uuid, uuid, text, text, text, text, text, jsonb, text, text, jsonb, jsonb) to service_role;

---------------------------------------------------------------------------
-- 每日維護：對話保留 30 天（最後一則訊息起算），點子快取跟著一起刪
---------------------------------------------------------------------------
create function private.purge_old_chat_conversations()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.chef_conversations where last_message_at < now() - interval '30 days';
$$;
revoke execute on function private.purge_old_chat_conversations() from public, anon, authenticated;

create or replace function private.run_daily_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step text;
  v_failed boolean := false;
begin
  foreach v_step in array array[
    'purge_removed_pantry_items', 'purge_deleted_recipes', 'purge_deleted_kitchens', 'purge_old_error_logs', 'purge_old_ai_usage',
    'purge_old_chat_conversations'
  ] loop
    begin
      execute format('select private.%I()', v_step);
    exception when others then
      v_failed := true;
      perform private.log_error('cron', 'daily_maintenance_failed', v_step, 'critical');
    end;
  end loop;

  if not v_failed then
    perform private.log_error('cron', 'daily_maintenance_ok', 'daily_maintenance', 'info');
  end if;
end;
$$;

---------------------------------------------------------------------------
-- 收藏 AI 想的點子（沒有 baseDishId）：快照加上 suggestionId，同一則點子＋同一個菜名每人只能收藏一筆
---------------------------------------------------------------------------
alter table public.bookmarks drop constraint bookmarks_idea_check;
alter table public.bookmarks add constraint bookmarks_idea_check check (extensions.jsonb_matches_schema(
  '{
    "type": "object",
    "required": ["schemaVersion", "title"],
    "properties": {
      "schemaVersion": { "const": 1 },
      "title": { "type": "string", "minLength": 1, "maxLength": 40 },
      "why": { "type": "string", "maxLength": 120 },
      "baseDishId": { "type": "string", "maxLength": 80 },
      "suggestionId": { "type": "string", "maxLength": 80 }
    },
    "additionalProperties": false
  }'::json, idea) and (idea ? 'baseDishId' or idea ? 'suggestionId'));

create unique index bookmarks_one_per_ai_idea on public.bookmarks (user_id, (idea ->> 'suggestionId'), (idea ->> 'title'))
  where kind = 'chef_idea' and deleted_at is null and idea ? 'suggestionId';

-- p_suggestion_id 是 ai_suggestion_cache 的一列（首頁或對話的點子）；點子的理由與主要食材由那一列讀，不信任手機送來的值
create function public.bookmark_ai_idea(p_id uuid, p_suggestion_id uuid, p_title text)
returns public.bookmarks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_idea jsonb;
  v_ids text[];
  v_main text[];
  v_row public.bookmarks;
  v_title text := btrim(coalesce(p_title, ''));
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_id is null or not private.is_uuid_v7(p_id) then
    raise exception 'invalid_id' using errcode = '22023';
  end if;

  select i into v_idea
  from public.ai_suggestion_cache s, jsonb_array_elements(s.payload -> 'ideas') i
  where s.id = p_suggestion_id and s.user_id = v_user and i ->> 'title' = v_title
  limit 1;
  if v_idea is null then
    raise exception 'idea_not_found' using errcode = '23503', hint = '找不到這個點子';
  end if;

  select * into v_row from public.bookmarks
  where user_id = v_user and kind = 'chef_idea' and deleted_at is null
    and idea ->> 'suggestionId' = p_suggestion_id::text and idea ->> 'title' = v_title;
  if found then
    return v_row;
  end if;

  select coalesce(array_agg(x), '{}') into v_ids from (
    select jsonb_array_elements_text(coalesce(v_idea -> 'usesPantryIds', '[]'))
    union
    select jsonb_array_elements_text(coalesce(v_idea -> 'usesMentionedIds', '[]'))
    union
    select o ->> 'ingredientId' from jsonb_array_elements(coalesce(v_idea -> 'otherIngredients', '[]')) o where o ->> 'ingredientId' is not null
  ) t(x);
  select coalesce(array_agg(i.id order by i.id), '{}') into v_main
  from public.dict_ingredients i
  where i.id = any (v_ids) and i.category not in ('seasoning', 'sauce', 'spice', 'oil');

  insert into public.bookmarks (id, user_id, kind, idea, idea_ingredient_ids)
  values (
    p_id, v_user, 'chef_idea',
    jsonb_strip_nulls(jsonb_build_object(
      'schemaVersion', 1,
      'title', v_title,
      'why', nullif(left(btrim(coalesce(v_idea ->> 'why', '')), 120), ''),
      'suggestionId', p_suggestion_id::text
    )),
    v_main
  )
  on conflict (id) do nothing
  returning * into v_row;

  if v_row.id is null then
    raise exception 'id_in_use' using errcode = '23505';
  end if;
  return v_row;
end;
$$;

revoke execute on function public.bookmark_ai_idea(uuid, uuid, text) from public, anon;
grant execute on function public.bookmark_ai_idea(uuid, uuid, text) to authenticated;
