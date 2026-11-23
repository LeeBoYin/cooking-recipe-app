-- M1b-04b：自己記錄的食譜計入口味檔案（03〈口味檔案〉、13 第六節）。
-- 「發佈後整理」寫好標籤（recipes.ai_tags）之後才算：沒有標籤的食譜不進口味。
-- 一、taste_profile_snapshots.sources 多一個選填的 recorded（算進來的自己的食譜數）。
-- 二、recipes 的標籤、亮點、狀態、刪除一改，由觸發器把作者的口味檔案標成過期。
-- 三、taste_recorded_recipes：重算口味時讀自己的食譜（只給 ai 函式）。
-- 四、產品事件白名單加 record.chef_note（大廚的一句話顯示了沒有，只記結果）。

alter table public.taste_profile_snapshots drop constraint taste_profile_snapshots_data_check;
alter table public.taste_profile_snapshots add constraint taste_profile_snapshots_data_check check (extensions.jsonb_matches_schema(
  '{
    "type": "object",
    "required": ["schemaVersion", "dims", "context", "sources"],
    "properties": {
      "schemaVersion": { "const": 1 },
      "dims": {
        "type": "object",
        "additionalProperties": {
          "type": "object",
          "required": ["affinity", "confidence", "source", "updatedAt"],
          "properties": {
            "affinity": { "type": "number", "minimum": -1, "maximum": 1 },
            "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
            "source": { "enum": ["user_set", "explored", "learned"] },
            "updatedAt": { "type": "string" }
          },
          "additionalProperties": false
        }
      },
      "context": {
        "type": "object",
        "required": ["adventure", "goals", "festiveDishes"],
        "properties": {
          "timePreference": { "enum": ["quick", "normal", "relaxed"] },
          "cooksFor": { "type": "array", "items": { "enum": ["self", "partner", "family", "guests"] } },
          "adventure": { "type": "number", "minimum": 0, "maximum": 1 },
          "goals": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 20 },
          "festiveDishes": { "type": "boolean" }
        },
        "additionalProperties": false
      },
      "sources": {
        "type": "object",
        "required": ["quiz", "saved", "cooked", "signals", "pantry"],
        "properties": {
          "quiz": { "type": "boolean" },
          "saved": { "type": "integer", "minimum": 0 },
          "cooked": { "type": "integer", "minimum": 0 },
          "recorded": { "type": "integer", "minimum": 0 },
          "signals": { "type": "integer", "minimum": 0 },
          "pantry": { "type": "integer", "minimum": 0 }
        },
        "additionalProperties": false
      }
    },
    "additionalProperties": false
  }'::json, data));

-- 標籤寫好、亮點改了、發佈或刪除，都影響自己的口味
create trigger taste_stale_upd after update on public.recipes
  for each row when (
    old.ai_tags is distinct from new.ai_tags or old.highlights is distinct from new.highlights
    or old.status is distinct from new.status or old.deleted_at is distinct from new.deleted_at
  )
  execute function private.taste_stale_user();

-- 重算口味用：自己最近 200 篇已發佈、已有標籤的食譜。
-- 從收藏記錄的（收藏的 cooked_recipe_id 指到的）不重複算：那個點子已經用「做了」的權重算過一次。
create function public.taste_recorded_recipes(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'cuisine_keys', coalesce(r.ai_tags -> 'cuisine_keys', '[]'),
           'main_ingredient_ids', coalesce(r.ai_tags -> 'main_ingredient_ids', '[]'),
           'techniques', coalesce(r.ai_tags -> 'techniques', '[]'),
           'highlights', to_jsonb(r.highlights),
           'at', coalesce(r.cooked_at, r.published_at)) order by r.published_at desc), '[]')
  from (
    select * from public.recipes x
    where x.user_id = p_user and x.status = 'published' and x.deleted_at is null and x.ai_tags is not null
      and not exists (select 1 from public.bookmarks b where b.user_id = p_user and b.cooked_recipe_id = x.id and b.deleted_at is null)
    order by x.published_at desc
    limit 200
  ) r;
$$;
revoke execute on function public.taste_recorded_recipes(uuid) from public, anon, authenticated;
grant execute on function public.taste_recorded_recipes(uuid) to service_role;

create or replace function private.product_event_names()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'app.open', 'screen.view',
    'record.start', 'record.publish', 'record.abandon', 'record.draft_saved', 'record.draft_published',
    'record.dictation_used', 'record.ai_filled', 'record.chef_note',
    'recipe.revision_restored', 'import.finished',
    'chat.start', 'chat.message_sent',
    'suggestion.shown', 'suggestion.opened', 'suggestion.bookmarked', 'suggestion.recorded',
    'onboarding.step', 'taste.answered', 'settings.changed', 'error'
  ]
$$;
