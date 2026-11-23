# 今仔日煮啥（煮啥）

朋友之間的料理社群，加上一位懂你的靈感大廚。可安裝到手機的 PWA，資料只存在雲端。

目前狀態：規格完成，M0 進行中：登入、帳號與廚房、字典、食材、廚具、照片（廚具照片：資料表、轉檔、上傳）、食譜後端（資料表、權限、儲存與發佈函式、食譜照片權限）、食譜畫面（編輯頁與食譜頁）已完成、我的食譜（時間軸、草稿匣、搜尋、最近刪除）已完成，錯誤紀錄與每日維護（M0-13a）已完成，函式與每週維護（M0-13b）已完成，口味資料（M0-14：口味維度、題庫樣本、地區、基礎菜色，以及口味地圖與飲食限制兩張表）已完成，口味探索（M0-15：挑題與計分、73 題題庫、探索頁與口味名片）已完成，暱稱與大頭貼（M0-16a：頭像權限與 `set_avatar`、圓框裁切、「我的」頁的頭像與暱稱）已完成，口味地圖與設定（M0-16b：「我的」頁外框、口味地圖可改、飲食限制、人份與單位與大廚的語氣、口味名片接上過敏）已完成，新手引導 M0 版 ①（M0-17：願景卡、安裝到主畫面、飲食限制、口味探索接入、進度與重新跑一次）已完成，新手引導 M0 版 ②（M0-18：建立我的廚房、廚房裡有什麼、收尾、「30 秒盤點」小卡，地區資料加 `stapleIngredientIds`）已完成，首頁的大廚點子（M0-19：規則評分、點子卡片、換一組、點子抽屜）已完成，收藏大廚的點子（M0-19b：`bookmarks`、`bookmark_recipe`／`unbookmark_recipe`、點子抽屜的收藏、「食譜 → 收藏」分頁）已完成，大廚的靜態插圖與情境文案（M0-20：`Chef.tsx` 的表情、148 句情境句子、`core` 的挑選規則、接上首頁與各空畫面）已完成，份量與換算、「列出要買的」、單位偏好與一鍵切換（M0-21：`core/units` 的單位換算與食材文字解析、食譜頁的人數與單位切換、列出要買的、新食譜帶入平常煮幾人份）已完成，食材存檔時解析（M0-21b：`core` 的解析器把一列原文拆成食材 ID、數量、單位，`save_recipe` 檢查後存下，舊食譜由部署流程回填，食譜頁與「廚房有」改用解析好的欄位）已完成，純文字分享與 PWA 細節（M0-22：食譜頁分享、更新提示、網路斷了的提示、安裝教學共用元件與「我的」頁入口）已完成，地區資料（M0-17b：美國加州與日本的節日、常見與常備食材、過敏原、廚具、題庫與基礎菜色、中心溫度表）已完成，安全標準標註來源，不另外送專人審；M0 收尾（M0-23：對照 06、食材字典 300 筆、正式台手機驗收與修正）已完成，M0 的功能都做完了，進入自己用一個月的驗收；端對端測試、效能與無障礙檢查延後（見 08 專案建置）。M1a 進行中：邀請（M1a-01a：`invites`、`create_invite`、`accept-invite` 的密碼註冊）已完成，邀請後端 ②（M1a-01b：6 碼邀請碼、Auth「建立使用者前」hook 與 `complete_google_signup`、重設密碼連結）已完成，邀請與註冊畫面（M1a-02：邀請連結 `/invite/<token>`、iPhone 的安裝教學與 6 碼邀請碼、從登入頁輸入邀請碼、密碼或 Google 註冊、重設密碼 `/reset/<token>`）已完成；真正的 Google 登入還要使用者自己設定 Google Cloud 與 Supabase（見 M1a-01b 的 PR 說明）。管理後台基本版（M1a-12：後端與兩步驟驗證 TOTP——`admin` 函式、只能新增的 `admin_audit_logs`、系統管理員要 `aal2`；畫面——`/admin` 外框、邀請與使用者、系統設定、操作紀錄；邀請頁顯示邀請者暱稱）已完成，測試與正式專案要在 Supabase Dashboard 開啟 TOTP（見 M1a-12a 的 PR 說明）。方案與 AI 地基（M1a-03：`entitlements`、`app_config` 的 AI 總開關與每月預算、`_shared/ai-models.ts` 模型設定檔、`ai` 函式骨架與 `_selftest` 測試任務、前端 `data/ai.ts`、後台可調方案與唯讀顯示各任務的模型）已完成，Anthropic 金鑰要使用者自己設定（見 M1a-03 的 PR 說明），真正打 Claude 還沒驗證。用量保護（M1a-04：`ai_usage_records`、`ai_spend_monthly`、`ai_rate_counters`、`ai_usage_alerts`、`ai` 函式的 `guard`／`onUsage` 接上、速率與合理使用上限、全站預算 80%／100% 降級、異常標記、後台讀寫用的 `admin_*` 函式與 Console 上限對照）已完成，後台畫面（M1a-13：「AI 用量」頁——本月或前 12 個月的預算進度與 Console 硬上限對照、依任務與模型的用量與被擋下的比率、使用者排行、異常清單可標記已處理或暫停 AI；使用者頁可暫停 AI 與設個人的合理使用上限；系統設定可改用量保護的數值；預算用到 80%／100% 時每個後台頁面頂端顯示提示，App 首頁的提醒與快取命中率 M2 才加）已完成。食材正規化（M1a-05：`ingredient_mappings`、`user_ingredient_mappings`、`background_jobs`、`add_pantry_items` 與 `save_recipe` 依「使用者自己的對應 → 字典 → 全站對應」決定 `ingredient_id`、`background-jobs` 函式批次交給 Haiku 從字典候選裡選、結果寫進全站對應並回填舊的食材與食譜食材、`set_my_ingredient_mapping`；使用者手動修正目前只有後端，還沒有畫面入口；測試與正式專案要設 `BACKGROUND_JOBS_TOKEN` 與 Vault，見 M1a-05 的 PR 說明）已完成。大廚的點子（M1a-06：`ai_suggestion_cache`、`ai` 函式的 `home_ideas` 任務——L1 候選、新手門檻、6 小時快取與換一組最多 2 次、程式再檢查過敏原與安全規則、`ai_home_context`、評估集 10 組；首頁先顯示上次的點子再問後端）已完成；真的 Claude 評估還沒跑（測試專案已設金鑰，跑法見 `spikes/README.md`）。和大廚聊聊 ①（M1a-07：`chef_conversations` 與 `ai_chat_get`／`ai_chat_append`、`ai` 函式的 `chat` 任務——Sonnet 5.5 串流呼叫、點子走首頁同一套程式再檢查、反問與偏好訊號先存下、20 輪上限與帶摘要開新的一段、全螢幕對話頁、首頁的「接著聊」、首頁與對話的卡片右上角收藏、`bookmark_ai_idea` 讓 AI 想的點子也能收藏、評估集 6 段）已完成；真的 Claude 評估還沒跑（跑法見 `spikes/README.md` 07）。和大廚聊聊 ②（M1a-08：反問顯示成大廚的一則話、點子抽屜改版——拿掉收藏、加「就聊這道」，首頁與對話共用，兩種入口都代送「想做〇〇」）已完成；真的 Claude 評估一樣還沒跑。點子抽屜直接顯示做法（M1a-09：`expand_steps` 任務——後端自己讀點子與廚房、輸出食材與步驟（公制與攝氏的結構化欄位）、程式再檢查過敏原與安全規則（沒過整份不用、自動重寫一次）、舒肥只能從安全表挑（表是空的所以一律擋下）、寫好的做法存進 `ai_suggestion_cache.drafts` 與收藏的 `recipeDraft`、失敗不存；抽屜等待時顯示思考中的大廚、家常菜先顯示骨架、失敗顯示「大廚需要再想想」與「再試一次」；「做了，記錄一篇」改放在「食譜 → 收藏」的點子裡，帶入食材與步驟；評估集 5 組）已完成；真的 Claude 評估還沒跑（跑法見 `spikes/README.md` 08）。大廚與點子的體驗改善（M1a-09b～09f：抽屜可拖曳關閉與收藏切換、首頁點子輪播、收藏的點子完整頁、廚房清單小卡片，以及和大廚聊聊 ③——三步收斂、至少 3 輪才給點子或按「直接給我點子」、`ask` 改成問題加 2–4 個選項、一次 1–2 個點子、盡量用到提到的食材（程式檢查、重寫一次）、點子卡片列出「你提到的食材」）已完成；真的 Claude 評估還沒跑（跑法見 `spikes/README.md` 07）。和大廚聊聊 ④（M1a-09h：對話頁依 `visualViewport` 避開 iPhone 鍵盤、`chat` 輸出加 `hint` 當輸入框的接著說提示）已完成，鍵盤待使用者用 iPhone 確認。iOS 外殼與轉場（M1a-09i：manifest 直向、自製 `TransitionRouter` 讓下層頁用 View Transitions 滑入滑出、Safari 手勢返回不疊動畫）已完成，要用 iPhone 確認。畫面細修（M1a-09g：刪除食譜後回清單、廚房小卡的角標與圖示、廚房動作列、食譜與收藏共用的搜尋列、收藏卡片精簡、首頁「換一組」放在輪播最後與骨架卡）已完成。口味檔案與點子回饋（M1a-10a：`taste_profile_snapshots`、觸發器標過期、`ai` 函式用 `core` 的 `computeTasteProfile` 重算——口味地圖＋收藏、做了、對話裡的長期偏好、手邊食材；`record_bookmark_cooked`、`ai_suggestion_cache.feedback`；自己記錄的食譜等 M1b 發佈後整理才算）已完成。AI 不能用時的畫面統一（M1a-10b：拿掉所有「改用規則評分」的退路，用 AI 的功能不能用時只告訴使用者目前無法使用——首頁有上次的點子就繼續顯示並說想不出新的、沒有就只顯示大廚與提示、新手門檻改成請使用者多說口味並附口味探索入口；`ai_usage_records.outcome` 記輸出檢查的結果〔通過、重寫後通過、被擋下〕；背景任務放棄時寫 `error_logs`）已完成。產品事件與 `track`（M1a-11：`analytics_identities`、`product_events`——兩張表沒有任何 API 角色能讀寫、只經 `track_events` 寫入；白名單寫在 `packages/core/src/track/events.ts`、前端與 `track` 函式共用；`track` 函式、前端 `data/track.ts` 的佇列與批次、App／畫面／記錄／靈感／新手引導／設定／錯誤等事件接上；不存點子 ID；「不參與使用統計」只有後端檢查、開關的畫面與每月匯總要等正式邀請前與 M2，見 08）已完成。下一段 M1a-14。收藏（`bookmarks`）目前只有大廚的點子，朋友的食譜 M2 才有。

## 溝通與文件

- 和使用者溝通、寫文件、寫介面文案，一律用**台灣繁體中文**，用台灣的說法（「食材」「影片」「設定」）。
- 文件只寫**最後定案的規格與目的**，不寫改版過程（「原本…後來改成…」、決策編號、日期）。過程留在 git 歷史。
- 文字要白話、句子短；名稱用使用者看得懂的說法，不用系統內部的名字。
- 實作和規格不一致時，先停下來問；確定之後**同時改程式和文件**，不讓兩邊分岔。

## 文件地圖（`docs/`）

| 要找 | 看 |
|------|-----|
| 產品原則、大廚的語氣 | 01 |
| 功能規格 | 02 |
| AI 任務、模型、成本 | 03 |
| 架構決策（ADR） | 04 |
| 資料模型（欄位與理由） | 05 |
| 路線圖、已確定的決定 | 06 |
| 廚具、手法、安全規則 | 07 |
| 還沒定的事、待辦 | 08 |
| 使用者流程 | 09 |
| 新手引導、口味地圖 | 12、13 |
| 產品數據與事件 | 14 |
| 地區與語系 | 15 |
| 後端實作清單（資料表、權限、函式、建置順序） | 16 |
| 色彩、字型、版面、元件、大廚的動畫 | 17 |
| 實作計劃（每一段做什麼、順序、用哪個模型） | 18 |
| 技術驗證的結果 | `spikes/README.md` |

## 技術組合

Vite＋React＋TypeScript 的 PWA（放在 Netlify）；Supabase（Postgres＋RLS、Auth、Storage、Realtime、Edge Functions、pg_cron）；AI 只透過 `ai` Edge Function 呼叫 Claude（每個任務的模型、effort、輸出上限在 `supabase/functions/_shared/ai-models.ts`）。專案結構見 04 ADR-11（pnpm monorepo：`apps/web`、`packages/core`、`ingredients`、`equipment`、`taste`、`shared-types`、`supabase/`）。

## 開發慣例

**進行方式**
- 一個功能做成一條直線：資料表與 RLS → 權限的自動化測試 → 資料庫函式 → 前端資料存取層 → 畫面 → 端對端測試。
- 一個功能一個分支、一個 PR。照 `docs/18-implementation-plan.md` 的順序領下一段；做完把該段打勾、更新目前狀態。

**資料庫**
- 資料庫與資料存取層一律 snake_case；TypeScript 型別用 `supabase gen types` 產生，不手寫重複的型別。
- 每張表都要有 RLS，並先寫權限測試。權限全部由 RLS 判斷，不靠前端隱藏。
- 要改好幾張表的動作寫成 RPC（`save_recipe`、`publish_recipe`…），一次全部成功或全部不做。
- 雲端的 `service_role` 對資料表沒有預設的讀寫權限（本機比較寬鬆）：Edge Function 要直接讀的表明確 `grant select`，寫入走 `SECURITY DEFINER` 函式；pgTAP 用「收回權限」模擬雲端（見 `spikes/README.md` 04）。
- 衍生欄位由資料庫函式計算，不信任手機送來的值。
- ID 由手機產生（UUID v7）；`created_at`、`updated_at` 由資料庫設定。
- 列舉用 `text`＋`CHECK`，不用 Postgres 的 `ENUM`；`jsonb` 欄位用 `pg_jsonschema` 檢查格式，並帶 `schemaVersion`。
- M2 完成、正式邀請朋友之前，只有兩三位測試者，App 的資料可以整個清掉重建：結構改動不用和前一版 App 相容、不支援舊資料，不用的欄位直接拿掉。架構改動需要清掉現有資料時，先告訴使用者。正式邀請之後，改成先加欄位、下一版才拿掉舊的。

**共用套件**（前端和 Edge Functions 都會用）
- 相對匯入一律寫 `.ts` 副檔名；前端 `tsconfig` 開 `allowImportingTsExtensions`。
- 只用標準的 JavaScript 與 TypeScript，不用 Node 或瀏覽器專屬的 API。
- Edge Runtime 相容 Deno 2.1，不要用更新版才有的 Deno 功能。

**介面與內容**
- 不寫死中文字串：介面文字放語系檔，用 ICU MessageFormat（FormatJS）。字典與列舉的 ID 一律用英文代碼。
- 數值存「原始值＋原始單位」，顯示時才換算（`core` 的單位模組）。
- 不顯示任何頻率、次數、連續天數，也不寫催促的文案（產品原則「偶爾用也完整」）。
- 不做離線；網路斷了只顯示提示。M0 不暫存文字；沒傳完的照片暫存在手機。

**照片**
- 手機端轉 WebP，三種尺寸（1600／1080／400px）。瀏覽器不能輸出 WebP（iPhone 的 Safari）時用 `@jsquash/webp`，打開編輯頁時先預載。
- 轉檔前先讀出拍攝時間；重新編碼會拿掉 EXIF（含 GPS）。
- 食譜上方最多 5 張、步驟最多 10 步且每步 1 張；第一張就是封面，不裁切。食譜與步驟的照片檔先傳到 Storage，資料列一律經 `save_recipe` 的 `p_photos` 建立；草稿自動存，已發佈的按「儲存」才更新（連照片）。

**AI**
- 前端不直接呼叫 Claude；每個任務的模型、effort、輸出上限寫在後端設定檔（見 03〈模型選擇〉）。
- 過敏原與安全規則由程式再檢查一次，不只靠 AI。安全標準（中心溫度表、舒肥表）只用在 AI 推薦，不影響其他功能。

**隱私**
- 管理後台只看統計與帳號資料，不能讀使用者的私人內容。
- 產品事件只記操作、不記內容，用分析 ID，不存使用者 ID。

## 環境與安全

- Supabase 正式專案 `dvlfioarakgddstcwfiu`、測試專案 `usnsgpcutztcmnjbqopg`（東京、免費方案）。
- 正式網站 https://tsu-siann.today（Netlify，從 `main` 自動部署；舊網址 tsu-siann.netlify.app 會導向它；預覽網址連測試專案）。
- 測試站 https://staging.tsu-siann.today：Netlify 部署 `staging` 分支，連測試專案、資料和正式台分開，用來建假資料；`staging` 由 `.github/workflows/sync-staging.yml` 隨 `main` 對齊，不要直接推東西進去。
- 實驗和測試的 SQL 只在**測試專案**或本機跑；正式專案只透過 CI 部署。
- 金鑰不進儲存庫：資料庫密碼、Anthropic 金鑰、VAPID 私密金鑰、推播訂閱資料都不 commit，也不貼進對話。
- 本機開發用 Supabase CLI＋OrbStack（Docker）。若找不到 `docker` 指令，先把 `~/.orbstack/bin` 加進 `PATH`。

## 常用指令

需要 Node 24、pnpm、Supabase CLI、Deno；本機資料庫要先開 OrbStack。

| 做什麼 | 指令 |
|-------|------|
| 安裝 | `pnpm install` |
| 開發伺服器（http://localhost:5173） | `pnpm dev`；先把 `apps/web/.env.example` 複製成 `.env.local` |
| 型別檢查 | `pnpm typecheck` |
| 單元測試 | `pnpm test` |
| 共用套件能不能在 Deno 跑 | `pnpm check:deno` |
| Edge Functions 的型別檢查與測試（Deno） | `pnpm check:functions` |
| 建置 | `pnpm build` |
| 本機資料庫：啟動／停止／重建 | `pnpm db:start`、`pnpm db:stop`、`pnpm db:reset`（重建時匯入字典，並套用 `supabase/seed.sql` 建一個本機開發帳號） |
| 改了字典檔後重新匯入本機 | `pnpm db:dict` 產生 SQL，再 `pnpm db:reset` |
| 資料庫的權限測試（pgTAP） | `pnpm db:test`；測試放在 `supabase/tests/` |
| 從本機資料庫產生型別 | `pnpm gen:types`（產生 `packages/shared-types/src/database.ts`，不要手改） |

**部署**：前端由 Netlify 從 git 自動部署（`netlify.toml`）；每個 PR 由 GitHub Actions 跑型別檢查、測試、Deno 檢查、建置，以及資料庫的權限測試與型別是否過期（`.github/workflows/ci.yml`）。資料庫由 `.github/workflows/deploy-db.yml` 部署：PR 改到資料庫或字典時對測試專案試跑，合併到 `main` 後先部署測試專案、成功才部署正式專案；每次先套用 migration，再整批匯入字典。Edge Functions 跟著資料庫一起部署（`supabase/functions/`）；每週喚醒與孤兒照片檔掃描由 `.github/workflows/weekly.yml` 執行。
