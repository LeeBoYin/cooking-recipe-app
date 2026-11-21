#!/usr/bin/env bash
# 在本機資料庫產生一筆邀請，印出原始 token（只此一次，資料庫只存雜湊）。
# 用法：scripts/create-invite.sh email [備註] [方案 free|plus]
# 需要本機資料庫已啟動（pnpm db:start），以及 psql 或 docker；只連本機，不碰測試或正式專案。
# 正式發邀請走管理後台（M1a-12）。
set -euo pipefail

email="${1:?用法：scripts/create-invite.sh email [備註] [方案]}"
note="${2:-}"
plan="${3:-free}"
db_url="${LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

case "$db_url" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "只能對本機資料庫使用" >&2; exit 1 ;;
esac

# 沒有 psql 時，用本機資料庫的容器裡的 psql
if command -v psql >/dev/null; then
  run_psql=(psql "$db_url")
else
  run_psql=(docker exec -i supabase_db_cooking-recipe-app psql -U postgres -d postgres)
fi

"${run_psql[@]}" -v ON_ERROR_STOP=1 -At \
  -v email="$email" -v note="$note" -v plan="$plan" <<'SQL'
select 'invite_id=' || invite_id || E'\ntoken=' || token || E'\nexpires_at=' || expires_at
from public.create_invite(private.uuid_v7(), :'email', nullif(:'note', ''), :'plan');
SQL
