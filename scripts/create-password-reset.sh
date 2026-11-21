#!/usr/bin/env bash
# 在本機資料庫為某個使用者產生重設密碼連結，印出原始 token（只此一次，資料庫只存雜湊）。
# 用法：scripts/create-password-reset.sh email
# 需要本機資料庫已啟動（pnpm db:start），以及 psql 或 docker；只連本機，不碰測試或正式專案。
# 正式環境由管理後台的「產生重設密碼連結」產生（M1a-12）。連結 24 小時有效、只能用一次。
set -euo pipefail

email="${1:?用法：scripts/create-password-reset.sh email}"
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

"${run_psql[@]}" -v ON_ERROR_STOP=1 -At -v email="$email" <<'SQL'
select 'link_id=' || link_id || E'\ntoken=' || token || E'\nexpires_at=' || expires_at
from public.create_password_reset_link(
  private.uuid_v7(),
  (select id from auth.users where lower(email) = lower(:'email'))
);
SQL
