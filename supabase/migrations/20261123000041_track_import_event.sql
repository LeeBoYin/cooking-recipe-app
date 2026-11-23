-- M1b-05：產品事件白名單加「匯入」事件（import.finished）。
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
    'recipe.revision_restored', 'import.finished',
    'chat.start', 'chat.message_sent',
    'suggestion.shown', 'suggestion.opened', 'suggestion.bookmarked', 'suggestion.recorded',
    'onboarding.step', 'taste.answered', 'settings.changed', 'error'
  ]
$$;
