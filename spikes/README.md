# 開工前的技術驗證

對應 [06 開工前的技術驗證](../docs/06-roadmap.md#開工前的技術驗證)。每一項的腳本放在這個資料夾，結果記在下面。

## 01 資料庫擴充套件與中文搜尋（2026-11-19，測試專案）

腳本：[01-db-extensions.sql](01-db-extensions.sql)

| 項目 | 結果 |
|------|------|
| 免費方案能不能啟用 | ✅ `pgroonga` 3.2.5、`pg_cron` 1.6.4、`pg_net` 0.20.4、`pg_jsonschema` 0.3.3、`pg_trgm` 1.6、`pgcrypto` 1.3 都能啟用 |
| PGroonga 中文搜尋 | ✅ 「高麗菜」找到培根高麗菜、高麗菜飯；「炒蛋」找到番茄炒蛋、洋蔥炒蛋；「牛肉 麵」找到紅燒牛肉麵 |
| 「蔥」會不會誤中「洋蔥」 | 會（洋蔥炒蛋、蔥油餅、青蔥炒牛肉）。全文搜尋本來就無法區分；照規格，食材搜尋先用字典的別名對到 ID，再用 `ingredient_ids` 查 |
| `pg_trgm` 退路 | 「高麗菜」只找到高麗菜飯，漏了培根高麗菜。確定用 PGroonga；`ilike` 只當最後的退路 |
| `pg_jsonschema` | ✅ 格式對的回傳 true、不對的回傳 false |
| `pg_cron` | ✅ 能建立與刪除排程 |
| `pg_net` | ✅ 對外送 HTTP 請求，收到 200 |

**結論**：16 規劃的擴充套件都能在免費方案使用，中文搜尋用 PGroonga。

## 02 共用套件同時用在前端與後端（2026-11-19，本機）

資料夾：[02-shared-core](02-shared-core)

| 項目 | 結果 |
|------|------|
| Vite（前端）匯入 `@zhusha/core` | ✅ 型別檢查與打包都通過 |
| Deno 直接執行 | ✅ |
| Supabase Edge Function 匯入 `supabase/functions` 以外的共用套件 | ✅ 本機 `supabase functions serve` 正常回應（Edge Runtime 1.79.1，相容 Deno 2.1.4） |
| 部署到雲端時的打包 | 還沒驗證；第一次部署 Edge Function 到測試專案時確認 |

**要遵守的規則**
- 共用套件裡的相對匯入一律寫 `.ts` 副檔名（Deno 需要）；前端的 `tsconfig` 開 `allowImportingTsExtensions`。
- 共用套件只用標準的 JavaScript 與 TypeScript，不用 Node 或瀏覽器專屬的 API。
- Edge Runtime 相容的是 Deno 2.1，不要用更新版本才有的 Deno 功能。

## 03 iPhone 實機（2026-11-19，iOS 18.7）

測試頁：[03-pwa-device](03-pwa-device)（部署在 Netlify Drop 的臨時網址）

| 項目 | 結果 |
|------|------|
| 加入主畫面、從主畫面打開 | ✅ |
| Service Worker、通知權限、推播訂閱 | ✅ |
| 從後端送 Web Push | ✅ Apple 推播服務回應 201，手機收到通知 |
| 螢幕不關（Wake Lock） | ✅ 從主畫面打開時可以開啟，放著 1 分鐘螢幕沒有變暗 |
| 在手機上輸出 WebP | ❌ Safari 的 canvas 不能輸出 WebP，規格的照片格式要調整 |
| HEIC | iPhone 選照片時系統先轉成 JPEG（例：4284×5712、9 MB），App 不用自己解 HEIC |
| 讀取與縮圖 | ✅ 很快：最大的照片解碼約 150ms |
| 照片輸出格式 | 見下表 |

**之後要注意**
- 正式網站要用 `_headers` 讓 `manifest.webmanifest` 回傳 `application/manifest+json`（Netlify 預設回傳 `application/octet-stream`）。
- 推播的 VAPID subject 用正式網站的網址。

**照片輸出格式比較**（品質 0.8；相機照片 4284×5712）

| 尺寸 | 內建（退回 PNG） | JPEG | WebP 轉檔程式（WASM） |
|------|---------------|------|-------------------|
| 1600px | 3,251–4,481 KB | 534–808 KB | 196–415 KB，約 0.12–0.15 秒 |
| 1080px | 1,553–1,951 KB | 283–358 KB | 113–165 KB，約 0.06 秒 |
| 400px | 241–322 KB | 55–66 KB | 24–38 KB，約 0.01 秒 |
| 三種合計 | 5–6.8 MB | 0.9–1.2 MB | **0.33–0.62 MB** |

- WebP 轉檔程式第一次載入約 1 秒，第一次轉檔約 2.4 秒（之後每張約 0.2 秒），所以打開編輯頁時先預載。
- **結論**：iPhone 用 WebP 轉檔程式，大小約是 JPEG 的 40%，速度可以接受；已寫進 [04 ADR-06](../docs/04-architecture.md#adr-06照片在客戶端處理再上傳物件儲存)。免費方案 1 GB 約可放 2,000–3,000 張相機照片。

## 04 邀請註冊在不寄信的設定下能跑完（2026-11-21，測試專案）

對應 M1a-01a。`accept-invite` 暫時部署到測試專案、套用 `invites` 的 SQL，走一遍「產生邀請 → 註冊 → 密碼登入」，驗證完把資料表與函式都清掉、刪掉測試帳號與函式（之後由 CI 正式部署）。

| 項目 | 結果 |
|------|------|
| 公開註冊關閉（`enable_signup = false`）時，用 admin API 建立使用者 | ✅ 能建立；直接打 `/auth/v1/signup` 回 `signup_disabled` |
| `createUser({ email_confirm: true })` 不寄任何信 | ✅ `confirmation_sent_at`、`recovery_sent_at`、`email_change_sent_at` 都是空的 |
| 註冊完成後用密碼登入 | ✅ 取得 session，email 已確認 |
| 邀請標成已接受、建立自己的廚房 | ✅ |
| 中途失敗不留下一半的資料 | ✅ 本機強迫 `setup_new_user` 失敗：Auth 使用者與註冊資料都不在，邀請仍是待接受 |

**發現的坑：服務權限在雲端沒有資料表的預設讀寫權限**，本機卻有（本機預設較寬鬆），所以本機測試過不了的事，雲端才會出錯：
- Edge Function 用 `service_role` 讀 `invites`，要明確 `grant select`（和 `photos` 一樣）。
- `check_kitchen_has_admin` 是延後到交易結束才跑的觸發器，用的是最外層呼叫者的身分；服務權限沒有 `kitchen_members` 的讀取權限，註冊會報 `permission denied`。改成 `SECURITY DEFINER`。pgTAP 用「收回服務權限的資料表權限」模擬雲端，測得到這個問題。
- 這次沒有改 `supabase/config.toml` 的 Auth 設定（`enable_signup = false`、`enable_confirmations = false` 已經是這樣）；函式用 admin API 建立使用者，不依賴「Confirm email」開關。測試專案 Auth 後台的這個開關沒有讀出來確認，不影響結果。
- 用 `supabase db query --remote=<ref> --yes` 改雲端資料表後，PostgREST 的 schema 快取不會自動更新，要跑 `notify pgrst, 'reload schema'`；正式部署用 migration 不會有這個問題。

## 05 Auth「建立使用者前」hook 在免費方案能用（2026-11-21，測試專案）

對應 M1a-01b。在測試專案只建 `hook_before_user_created` 函式，用 `supabase config push`（只宣告要改的欄位，其他不動）開啟 hook 與「允許新使用者註冊」，測完把設定改回、函式與測試帳號清掉。

| 項目 | 結果 |
|------|------|
| 免費方案設定 `before_user_created` 的 Postgres 函式 hook | ✅ 設定被接受，不需要付費方案 |
| 公開的 `/auth/v1/signup`（密碼）在 hook 開啟後 | ✅ 回 403 `signup_requires_invite`（本機與測試專案結果相同）；試著在請求裡帶 `app_metadata`、`user_metadata` 的 `invite_signup` 也一樣被擋 |
| admin API（`createUser`）建立的使用者 | ✅ 不經過 hook（本機與測試專案都實測：沒帶標記也建得起來），`accept-invite` 的密碼註冊不受影響 |
| Google 登入的實際流程 | ❌ 沒測：需要使用者自己建 Google OAuth 用戶端。hook 的邏輯用模擬的事件在 pgTAP 測試（有邀請放行、沒邀請／過期／撤銷拒絕、不分大小寫），`complete_google_signup` 用模擬的 Google 使用者資料測試 |

- 「允許新使用者註冊」（`enable_signup`）關著時，OAuth 的新使用者也會被擋，所以 Google 登入一定要把它打開；打開後公開的密碼註冊靠 hook 擋回去。
- 測試專案的 Auth 設定有 Confirm email 開啟（`enable_confirmations = true`）；`createUser({ email_confirm: true })` 不受影響。
- hook 和 `enable_signup` 都不在 migration 裡，CI 也不推 Auth 設定；雲端要自己開（Dashboard，或 `supabase config push`）。
- 本機實跑（`supabase functions serve`）：打開連結產生邀請碼、重新產生後舊碼作廢、同一個來源錯 5 次暫停（暫停中連對的碼也不收、別的來源不受影響）、用邀請碼註冊並密碼登入、重設密碼（太弱的密碼不會用掉連結、用過一次就失效、舊密碼不能登入）都通過。本機的 Kong 會改寫 `x-real-ip`，所以測試時用 `cf-connecting-ip` 模擬不同來源；雲端是否真的帶 `cf-connecting-ip` 沒有驗證（見 PR 說明）。


## 06 首頁大廚點子（M1a-06，2026-11-21，本機）

資料夾：`supabase/functions/ai/home/`（提示詞 `prompt.ts`、檢查 `check.ts`、評估集 `eval/cases.ts`、實跑 `eval/run.ts`）

| 項目 | 結果 |
|------|------|
| 評估集 10 組假使用者的自動測試（假的 AI 回應，測「檢查會拿掉違規的點子」） | ✅ 過敏原與關鍵字、五辛素、不吃牛與料理酒、過期食材、電鍋做不到的手法與廚具、偶爾下廚的難度、催促與帶單位的數字、槽位數量與重複，都會被拿掉 |
| Edge Runtime 匯入 `supabase/functions` 以外的 `packages/`（`core`、字典） | ✅ 本機 `supabase functions serve` 正常；雲端打包第一次部署到測試專案時確認 |
| 整條路徑（用假的 Claude 伺服器，`ANTHROPIC_BASE_URL` 指到本機） | ✅ 首頁先顯示、後端呼叫、檢查、存快取；重新整理用快取（不再呼叫）；換一組 2 次都是新的、第 3 次退回規則評分；Claude 連不上時退回規則評分；新手門檻不呼叫 AI。用量紀錄的費用與 token 數對得上 |
| **真的 Claude 評估（Sonnet 5.5 與 Haiku 5.5 各 9 組，第 4 組新手門檻不呼叫）** | ✅ 在本機用另開的金鑰跑（2026-11-21）。Sonnet：有效輸出 9/9、檢查後留下 98%（40/41）、自動斷言 9/9、平均 US$0.0145、8.5 秒。Haiku：9/9、留下 88%（37/42）、斷言 8/9（麻婆豆腐那組沒把熟悉的菜排進去）、平均 US$0.0007、6.0 秒。**結論**：首頁點子維持 Sonnet；Haiku 當預算降級用可以，被拿掉的多半是禁用字眼與限制，程式檢查都擋得住 |
| 結構化輸出的 schema 在真的 API 上被接受 | ✅ 兩個模型都接受 |
| 前段規則（`stable`）被快取 | ✅ 第一次寫入約 2,500 token，之後每次都讀到（不同使用者也讀得到）。前提是 **schema 每次都一樣**：第一輪 schema 帶了每個人的候選代號與手法 enum，每次都只寫不讀；改成固定 schema 後，Sonnet 平均成本從 US$0.020 降到 US$0.0145 |
| 排除清單的食材 | 第一輪 Haiku 在「不吃牛、不用料理酒」那組 5 個點子全被拿掉（用了手邊的牛肉、替代說明寫「不加米酒」）。改成排除清單裡的食材不放進「手邊的食材」、prompt 要求連替代說明都不提之後，留下 4/5；Sonnet 4/4 |

**手動實跑**（會花錢，每次 20 次呼叫左右；金鑰只放在這個指令的環境變數，不寫進檔案、不貼進對話）：

```bash
ANTHROPIC_API_KEY=... deno run --no-lock --no-config -A supabase/functions/ai/home/eval/run.ts
```

終端機只印數量與代號；輸出寫在 `supabase/functions/ai/home/eval/out/<時間>/`（已加進 `.gitignore`）：每組每個模型一個 JSON，加上 `summary.md`（彙整表：有效輸出、檢查後留下的比例、自動斷言通過數、平均 token、快取 token、平均成本與延遲；各組 Sonnet 與 Haiku 並排，附口吻與合理度的打分欄）。`--model sonnet|haiku` 只跑一個、`--case 05` 只跑一組。口吻與合理度由人工打分，Haiku 能不能取代 Sonnet（預算用到提醒門檻時 `BUDGET_DEGRADE` 會自動降成 Haiku、關思考）要看打分與留下比例。

## 07 和大廚聊聊（M1a-07，2026-11-21，本機）

資料夾：`supabase/functions/ai/chat/`（提示詞 `prompt.ts`、檢查 `check.ts`、環境 `env.ts`、流程 `handler.ts`、評估集 `eval/cases.ts`、實跑 `eval/run.ts`）

| 項目 | 結果 |
|------|------|
| 評估集 6 段劇本（反問、過敏原、「不要太辣」接著聊、說了沒記在廚房的食材、20 輪附近、長期偏好）的自動測試（假的 AI 回應，測提示詞、檢查、存對話的規則） | ✅ 進 CI |
| 後端用串流呼叫 Claude、回給 App 一整段（官方 SDK 的 `messages.stream().finalMessage()`） | ✅ 本機 `supabase functions serve`＋假的 Claude 伺服器（`ANTHROPIC_BASE_URL`，SSE 事件）；真的 API 還沒驗證 |
| 整條路徑（假的 Claude）：送出、思考中、反問、點子卡片、收藏、接著聊、6 小時後首頁不再出現「接著聊」、20 輪上限與開新的一段、偏好訊號與說過的食材存下、Claude 連不上（500）時使用者的話留在畫面上、什麼都不存 | ✅ 手機寬度（375px）走過一遍 |
| M1a-08 整條路徑（假的 Claude）：反問顯示成大廚的一則話（沒有卡片）、點子抽屜（首頁與對話都沒有收藏、有「就聊這道」）、對話裡的「就聊這道」在同一段代送「想做〇〇」、首頁的「就聊這道」開新的一段代送（只送一次） | ✅ 手機寬度（375px）走過一遍；真的 API 還沒驗證 |
| 真的 Claude 評估（Sonnet 5.5，2026-11-21 本機） | ✅ 6 段 10 輪，有效輸出 10/10，`reply` 被擋 0 則；平均每輪 US$0.0106、6.0 秒（約 3–10 秒）；每輪都讀到約 5,800 token 的快取。串流與 schema（含 `anyOf`）真的 API 都接受。第 1 段「想吃點熱的」大廚沒反問、直接給點子：手邊食材夠時這樣比較好，斷言改成只檢查反問的規則（有反問就不給點子、不連續追問）。第 4 段「筍子」對不到字典，點子有用上但記不到 ID：竹筍加上別名「筍子」「冬筍」「桂竹筍」 |

M1a-09f（多輪收斂）：評估集改寫成 9 段多輪劇本（盤點→問風味→收斂、過敏原、直接給我點子、太早給點子被重寫、食材搭不起來、說了沒記的食材、給點子後接著調整、20 輪附近、長期偏好），自動測試（假的 AI 回應，含「重寫一次」的兩次嘗試）✅ 進 CI；`ai_chat_append` 的 `p_ask` 改 jsonb 的 pgTAP ✅。**真的 Claude 評估還沒跑**（這個環境沒有金鑰）：跑的時候看「第 3 輪前不給點子的比例」「按『直接給我點子』之外自己明說要點子時 `user_wants_ideas` 準不準」「重寫的比例（太早給點子、食材用得少）」「每段對話平均輪數與成本」。

**手動實跑**（只跑 Sonnet 5.5；會花錢，9 段約 17 輪，加上重寫，合計約 1 美元；金鑰只放在這個指令的環境變數，不寫進檔案、不貼進對話）：

```bash
ANTHROPIC_API_KEY=... deno run --no-lock --no-config -A supabase/functions/ai/chat/eval/run.ts
```

只跑一段加 `--case 03`。終端機只印數量與代號；輸出寫在 `supabase/functions/ai/chat/eval/out/<時間>/`（已加進 `.gitignore`）：每段一個 JSON，加上 `summary.md`（彙整：有效輸出、平均 token、快取讀寫、成本、延遲；每輪的使用者的話與大廚的回應，留空格給人工打分口吻與合理度）。

**要看的地方**
- 自動斷言全過幾段；`reply` 被「帶單位的數字」或排除清單擋下的比例（擋下就是整則不用，使用者會看到「大廚想不出來」；比例高就要調提示詞）。
- 反問只在條件真的模糊時出現，而且不連續追問；「想做〇〇」不寫完整步驟。
- 快取：`stable`＋`volatile` 第二輪起要讀得到（快取讀 token 不為 0）。
- 偏好訊號：今天的要求是 `today`、長期的才是 `long_term`。

## 08 點子抽屜的做法（M1a-09，本機）

資料夾：`supabase/functions/ai/expand/`（提示詞 `prompt.ts`、檢查 `check.ts`、點子整理 `idea.ts`、流程 `handler.ts`、評估集 `eval/cases.ts`、實跑 `eval/run.ts`）

| 項目 | 結果 |
|------|------|
| 評估集 5 組（家常菜骨架、AI 想的新點子、蝦與花生過敏、有舒肥棒的人遇到雞胸、只有電鍋）的自動測試（假的 AI 回應，測提示詞、檢查、存做法的規則；整份不用、重寫一次、兩次都不過什麼都不存、已展開的不重算） | ✅ 進 CI |
| 資料庫：`ai_expand_get`／`ai_expand_save` 的權限、做法存進快取的 `drafts` 與收藏的 `recipeDraft`、收藏時帶著做法、收藏的點子快照不能被改 | ✅ pgTAP |
| 手機整條路徑（用假的 `ai` 回應，沒有真的 Claude）：首頁抽屜思考中 → 顯示做法、再開同一個點子不再呼叫、失敗顯示「大廚需要再想想」→「再試一次」、「食譜 → 收藏」的「看做法」與「做了，記錄一篇」帶入菜名、食材與步驟（存檔後食材被解析成標準食材） | ✅ 本機 `pnpm dev` 走過一遍 |
| 真的 Claude 評估（Sonnet 5.5） | ⏳ 還沒跑 |
| 輸出 schema 在真的 API 上被接受、提示詞快取（`stable`）讀得到、檢查一次就過的比例、平均成本與延遲 | ⏳ 還沒跑 |

**手動實跑**（只跑 Sonnet 5.5；會花錢，5 組合計不到 1 美元；金鑰只放在這個指令的環境變數，不寫進檔案、不貼進對話）：

```bash
ANTHROPIC_API_KEY=... deno run --no-lock --no-config -A supabase/functions/ai/expand/eval/run.ts
```

只跑一組加 `--case 03`。終端機只印數量與代號；輸出寫在 `supabase/functions/ai/expand/eval/out/<時間>/`（已加進 `.gitignore`）：每組一個 JSON，加上 `summary.md`（彙整：有效輸出、檢查一次就過的比例、自動斷言通過數、平均 token、快取讀寫、成本、延遲；每組的食材與步驟，留空格給人工打分合理度與口吻）。實跑只呼叫一次 Claude，不含自動重寫，所以「檢查一次就過」的比例就是自動重寫會多常發生。

**要看的地方**
- 檢查一次就過幾組；沒過的原因（`wording`＝步驟寫了數字最常見的話，要調提示詞）。
- 過敏那組沒有蝦與花生；舒肥那組沒有寫舒肥、雞肉的中心溫度提醒由程式附上；電鍋那組只用電鍋。
- 份量的單位都是公制或計數單位，`amount` 合理；步驟順、做得出來。
- 快取：`stable` 第二組起要讀得到（快取讀 token 不為 0）。
- 延遲：十幾秒內（不串流，整份寫完才顯示）；2,000 token 的輸出上限夠不夠（`truncated` 出現就要調）。

## 09 下層頁轉場（M1a-09i）

| 問題 | 結論 |
|------|------|
| 宣告式 `BrowserRouter` 能不能觸發 view transition？ | ❌ 不行。react-router 8.5 只有資料路由的 `<RouterProvider>` 會呼叫 `document.startViewTransition`，`BrowserRouter` 沒有這段。 |
| 改 `createBrowserRouter` 有用嗎？ | ⚠️ 進入（PUSH）可以用 `viewTransition` 選項，但瀏覽器上一頁（POP）路由器不帶 `viewTransition`，不會播；改了還要換 `ScrollRestoration`、整份路由改寫。不划算。 |
| 採用的做法 | 自己接 history：`UNSAFE_createBrowserHistory` 加公開的 `<Router>`（`TransitionRouter`），在 `history.listen` 裡把換畫面包進 `startViewTransition` ＋ `flushSync`。PUSH、REPLACE、POP 都由自己判斷；捲動位置自己記（`scrollRestoration = 'manual'`，依 `location.key`）。 |
| 返回記號 | 包住 navigator 的 `go`：`navigate(-1)` 呼叫時記號，手勢與瀏覽器上一頁不經過它。所以 `TopBar` 和對話頁的返回都不用改。 |
| 預覽（桌面 Chrome，本機）：進入、返回按鈕、`history.back/forward`、分頁切換、直接開網址、捲動還原 | ✅ 進入播 `vt-from-right`／`vt-to-left`、返回播 `vt-to-right`／`vt-from-left`；分頁切換沒有呼叫 `startViewTransition`；返回後捲動還原；放慢動畫截圖確認舊頁壓在上面往右滑出 |
| iOS Safari 手勢返回不疊兩層、加到主畫面後返回按鈕有動畫 | ⏳ 這台 Mac 沒有完整 Xcode，模擬器用不了；要用 iPhone 確認 |

## 10 用說的（M1b-03，本機）

資料夾：`supabase/functions/ai/dictation/`（提示詞與輸出格式 `prompt.ts`、合併與流程 `handler.ts`、評估集 `eval/cases.ts`、實跑 `eval/run.ts`；合併規則本身在 `packages/core/src/dictation.ts`）

| 項目 | 結果 |
|------|------|
| 評估集 10 組假口述的自動測試（假的 AI 回應，測合併規則、重寫、作者填的內容不被改、難易度規則、自動斷言本身） | ✅ 進 CI（`pnpm check:functions`） |
| 資料庫：作者動過的難易度不能被 AI 覆寫（觸發器）、作者自己改與清掉照常 | ✅ pgTAP（`28_difficulty_author_guard.sql`） |
| 手機整條路徑（用假的 `ai` 回應，沒有真的 Claude）：🎙 開面板、自動對焦與字數、整理成功（欄位填好、「新的」標記、編輯後標記消失、口述原文與難易度 `source: ai` 存進資料庫）、AI 不能用（原話接在心得後面、出現「讓大廚整理」）、再按「讓大廚整理」用存著的原話重跑、進階滑桿一動就是 `author`、食譜頁標「大廚估的」 | ✅ 本機瀏覽器 |
| **真的 Claude 評估（Sonnet 5.5 與 Haiku 5.5 各 10 組，2026-11-23，使用者在本機跑）** | ✅ Sonnet：有效輸出 10/10、**守住作者內容 10/10**，每次約 US$0.003、2.7 秒；Haiku：有效輸出 10/10、守住作者內容 9/10，每次約 US$0.00014、1.8 秒。Haiku 的問題：第 03 組漏掉新步驟、第 05、10 組標題空白、第 08 組漏食材。**結論：保留 Sonnet 5.5**（每月 40 次約 US$0.12，成本不是問題） |
| 評估後修正 | 英文口述（第 09 組，兩個模型都是）沒說份量的食材寫成中文「適量」→ 提示詞改成跟著口述的語言（英文 to taste），斷言一併檢查；第 01 組「技巧面向應該很低」的斷言和字典不一致（07 的 `stir-fry` 技巧等級是 3，Sonnet 給 3 是對的）→ 斷言改成依字典（不高過炒的等級）。修正後還沒再用真的 Claude 跑 |
| 輸出 schema 在真的 API 上被接受 | ✅ 兩個模型都接受 |
| iPhone 鍵盤的麥克風聽寫、面板開啟時鍵盤自動彈出 | ⏳ 還沒用 iPhone 確認 |

**手動實跑**（會花錢，10 組 × 2 個模型，合計不到 1 美元；金鑰只放在這個指令的環境變數，不寫進檔案、不貼進對話）：

```bash
ANTHROPIC_API_KEY=... deno run --no-lock --no-config -A supabase/functions/ai/dictation/eval/run.ts
```

只跑一組加 `--case 03`，只跑一個模型加 `--model sonnet` 或 `--model haiku`。終端機只印數量與代號；輸出寫在 `supabase/functions/ai/dictation/eval/out/<時間>/`（已加進 `.gitignore`）：每組每個模型一個 JSON，加上 `summary.md`（彙整表加每組兩個模型並排，給人工打分）。

**要看的地方**
- 「守住作者填的內容」：第 3 組（作者已經寫了食材與步驟）兩個模型第一次就守住幾組；沒守住的程式會重寫一次，常常重寫代表提示詞要調。
- 沒亂補：第 5 組（只講心情）不能憑空列食材與步驟；第 6 組沒說份量要寫「適量」；第 8 組（舒肥）不能自己補溫度。
- 第 10 組（口述裡夾指令）不能照做。
- 難易度：第 1 組很低、第 4 組（慢滷）的時間面向要偏高、第 8 組廚具偏高。
- 兩個模型的差距：這次 Haiku 差距不小（見上表），保留 Sonnet；之後想再試 Haiku，改 `_shared/ai-models.ts` 一行：`model: 'claude-haiku-5-5'`、`thinking: 'off'`。

## 11 用說的改食譜（M1b-04a，本機）

資料夾：`supabase/functions/ai/refine/`（提示詞與輸出格式 `prompt.ts`、流程 `handler.ts`、評估集 `eval/cases.ts`、實跑 `eval/run.ts`；「模型的修改 → 驗證過的變更清單」規則在 `packages/core/src/refine.ts`，套進編輯頁表單的規則在 `apps/web/src/features/recipe/refine.ts`）

| 項目 | 結果 |
|------|------|
| 評估集 8 組假指令的自動測試（假的 AI 回應，測變更清單的驗證、輸入檢查、重試、AI 不能用、自動斷言本身會抓到「夾帶的指令被照做」） | ✅ 進 CI（`pnpm check:functions`） |
| 變更清單套進編輯頁的表單（改字與新增標「新的」、有照片的步驟不丟照片、沒說到的列原樣） | ✅ 單元測試（`apps/web` 的 `refine.test.ts`） |
| 手機整條路徑（用假的 `ai` 回應，沒有真的 Claude）：編輯頁 🎙 開「再跟大廚說」面板、列出「會改這些」、按套用後標題與食材改了且標「新的」；食譜頁的 🎙 直接跳進編輯頁開面板、套用後「有改過，還沒儲存」、按儲存後 `recipe_revisions` 多一版 `changed_by = ai_refine`；AI 不能用時顯示「大廚現在無法使用，先用手動編輯吧」 | ✅ 本機瀏覽器（「沒聽出要改哪裡」的畫面只有單元測試，沒有在瀏覽器走） |
| 真的 Claude 評估（Haiku 5.5，8 組） | ⏳ 還沒跑，要使用者在本機跑 |
| 輸出 schema 在真的 API 上被接受 | ⏳ 還沒跑（同上） |

**手動實跑**（會花錢，8 組合計不到 0.01 美元；金鑰只放在這個指令的環境變數，不寫進檔案、不貼進對話）：

```bash
ANTHROPIC_API_KEY=... deno run --no-lock --no-config -A supabase/functions/ai/refine/eval/run.ts
```

只跑一組加 `--case 05`。終端機只印數量與代號；輸出寫在 `supabase/functions/ai/refine/eval/out/<時間>/`（已加進 `.gitignore`）：每組一個 JSON，加上 `summary.md`（每組的變更清單，給人工打分）。

**要看的地方**
- 第 1 組（拿蒜頭、改份量）：步驟二的蒜頭有沒有一起改；第 2、3 組只動該動的地方。
- 第 5 組（拿掉食譜沒有的香菜）：什麼都不能改。
- 第 6、7 組：指令裡、料理筆記裡夾的假指令不能照做。
- 第 8 組（英文）：不能翻成中文。
- Haiku 不思考，若編號常對錯（拿錯項）或常漏改步驟裡的連動，考慮改 Sonnet 5.5（`_shared/ai-models.ts` 一行）。
