-- M1b-03：產品事件白名單加「用說的」事件（record.dictation_used、record.ai_filled）。
-- 清單和 packages/core/src/track/events.ts 一致，有測試比對；product_events 的 CHECK 呼叫這個函式，改函式內容即可。
create or replace function private.product_event_names()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'app.open', 'screen.view',
    'record.start', 'record.publish', 'record.abandon', 'record.draft_saved', 'record.draft_published',
    'record.dictation_used', 'record.ai_filled',
    'recipe.revision_restored', 'import.finished',
    'chat.start', 'chat.message_sent',
    'suggestion.shown', 'suggestion.opened', 'suggestion.bookmarked', 'suggestion.recorded',
    'onboarding.step', 'taste.answered', 'settings.changed', 'error'
  ]
$$;
