-- M1b-05：從網址匯入的食譜存來源（recipes.source，type = 'url'）。
-- 來源要能顯示「網站名稱＋連結」，所以 source 多一個 name；url 只允許 http／https。
-- save_recipe 本來就能寫 source，不用動。
create or replace function private.is_recipe_source(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": { "enum": ["original", "url", "friend", "share_link", "ai", "external_ai"] },
        "share_link_id": { "type": "string", "maxLength": 64 },
        "url": { "type": "string", "maxLength": 2000, "pattern": "^https?://" },
        "name": { "type": "string", "maxLength": 60 },
        "from_user_id": { "type": "string", "maxLength": 64 },
        "from_user_name": { "type": "string", "maxLength": 60 }
      },
      "additionalProperties": false
    }'::json,
    value
  );
$$;
