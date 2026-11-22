-- 和大廚聊聊 ③（M1a-09f）：反問改成「問題＋2 到 4 個選項＋可否複選」。
-- messages 裡大廚那則的 ask 從字串改成物件；ai_chat_append 的 p_ask 從 text 改成 jsonb（沒有反問傳 null）。
-- 舊的字串反問沒有選項，直接拿掉（只剩大廚的話）。

update public.chef_conversations c set messages = (
  select coalesce(jsonb_agg(case when jsonb_typeof(m -> 'ask') = 'string' then m - 'ask' else m end order by ord), '[]')
  from jsonb_array_elements(c.messages) with ordinality as t(m, ord)
)
where exists (select 1 from jsonb_array_elements(c.messages) m where jsonb_typeof(m -> 'ask') = 'string');

alter table public.chef_conversations drop constraint chef_conversations_messages_check;
alter table public.chef_conversations add constraint chef_conversations_messages_check check (extensions.jsonb_matches_schema(
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
        "ask": {
          "type": "object",
          "required": ["question", "options", "multi"],
          "properties": {
            "question": { "type": "string", "minLength": 1, "maxLength": 300 },
            "options": { "type": "array", "minItems": 2, "maxItems": 4, "items": { "type": "string", "minLength": 1, "maxLength": 60 } },
            "multi": { "type": "boolean" }
          },
          "additionalProperties": false
        },
        "suggestionId": { "type": "string" },
        "at": { "type": "string" }
      },
      "additionalProperties": false
    }
  }'::json, messages));

drop function public.ai_chat_append(uuid, uuid, uuid, text, text, text, text, text, jsonb, text, text, jsonb, jsonb);

create function public.ai_chat_append(
  p_user uuid,
  p_kitchen uuid,
  p_conversation uuid,
  p_carry_summary text,
  p_lang text,
  p_user_text text,
  p_chef_text text,
  p_ask jsonb,
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
    'ask', p_ask,
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

revoke execute on function public.ai_chat_append(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ai_chat_append(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, jsonb, jsonb) to service_role;
