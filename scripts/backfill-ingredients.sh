#!/usr/bin/env bash
# 舊食譜的食材解析回填（M0-21b），部署流程在匯入字典之後呼叫：scripts/backfill-ingredients.sh <連線字串>
# 這個儲存庫是公開的，GitHub Actions 的紀錄任何人都看得到，所以：
#   - psql 與 node 的標準輸出、錯誤輸出都不進紀錄（錯誤訊息可能帶出食材原文或 SQL）
#   - 失敗只印「回填失敗：第 N 步」
#   - 暫存檔只放在 $RUNNER_TEMP（本機是臨時資料夾），結束時刪掉，不上傳
# 本機測試：PSQL_CMD 指向一個接受 psql 參數的指令（沒設就用 psql "<連線字串>"）。
set -euo pipefail

url="${1:-}"
exec 3>&2 # 失敗訊息走這個備份：函式裡的 2>/dev/null 在 set -e 結束時可能還沒還原
work="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/backfill.XXXXXX")"
step=1
cleanup() {
  rc=$?
  rm -rf "$work"
  if [ "$rc" -ne 0 ]; then echo "回填失敗：第 $step 步" >&3; fi
  exit "$rc"
}
trap cleanup EXIT

run_psql() {
  if [ -n "${PSQL_CMD:-}" ]; then $PSQL_CMD "$@"; else psql "$url" "$@"; fi
}

step=1 # 查出還沒解析的食譜
run_psql -v ON_ERROR_STOP=1 -At -f scripts/unparsed-recipes.sql >"$work/unparsed.json" 2>/dev/null
step=2 # 用 core 的解析器算好
node scripts/backfill-ingredients-sql.ts <"$work/unparsed.json" >"$work/backfill.sql" 2>/dev/null
step=3 # 逐篇回填
run_psql -v ON_ERROR_STOP=1 -q -f "$work/backfill.sql" >/dev/null 2>&1
echo "回填完成"
