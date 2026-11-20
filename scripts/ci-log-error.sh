#!/usr/bin/env bash
# 把排程、備份、喚醒的執行結果寫進 error_logs（04 ADR-21）。
# 用法：ci-log-error.sh <source> <kind> <location> <severity>
# 要先 supabase link（產生 supabase/.temp/pooler-url），並設好 PGPASSWORD。
# 參數都是 workflow 裡寫死的固定字串，不含使用者輸入。
set -euo pipefail
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -q \
  -c "select private.log_error('$1', '$2', '$3', '$4')"
