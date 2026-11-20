# 今仔日煮啥（煮啥）

朋友之間的料理社群，加上一位懂你的靈感大廚。可安裝到手機的 PWA，資料只存在雲端。

目前狀態：規格完成，M0 進行中：登入、帳號與廚房、字典、食材、廚具、照片（廚具照片：資料表、轉檔、上傳）、食譜後端（資料表、權限、儲存與發佈函式、食譜照片權限）、食譜畫面（編輯頁與食譜頁）已完成、我的食譜（時間軸、草稿匣、搜尋、最近刪除）已完成，錯誤紀錄與每日維護（M0-13a）已完成，函式與每週維護（M0-13b）已完成，口味資料（M0-14：口味維度、題庫樣本、地區、基礎菜色，以及口味地圖與飲食限制兩張表）已完成，口味探索（M0-15：挑題與計分、73 題題庫、探索頁與口味名片）已完成，下一段照 18 的順序領；其他功能照 18 的順序往下做。收藏（`bookmarks`）從 M1a 才做。

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

Vite＋React＋TypeScript 的 PWA（放在 Netlify）；Supabase（Postgres＋RLS、Auth、Storage、Realtime、Edge Functions、pg_cron）；AI 只透過 `ai` Edge Function 呼叫 Claude。專案結構見 04 ADR-11（pnpm monorepo：`apps/web`、`packages/core`、`ingredients`、`equipment`、`taste`、`shared-types`、`supabase/`）。

## 開發慣例

**進行方式**
- 一個功能做成一條直線：資料表與 RLS → 權限的自動化測試 → 資料庫函式 → 前端資料存取層 → 畫面 → 端對端測試。
- 一個功能一個分支、一個 PR。照 `docs/18-implementation-plan.md` 的順序領下一段；做完把該段打勾、更新目前狀態。

**資料庫**
- 資料庫與資料存取層一律 snake_case；TypeScript 型別用 `supabase gen types` 產生，不手寫重複的型別。
- 每張表都要有 RLS，並先寫權限測試。權限全部由 RLS 判斷，不靠前端隱藏。
- 要改好幾張表的動作寫成 RPC（`save_recipe`、`publish_recipe`…），一次全部成功或全部不做。
- 衍生欄位由資料庫函式計算，不信任手機送來的值。
- ID 由手機產生（UUID v7）；`created_at`、`updated_at` 由資料庫設定。
- 列舉用 `text`＋`CHECK`，不用 Postgres 的 `ENUM`；`jsonb` 欄位用 `pg_jsonschema` 檢查格式，並帶 `schemaVersion`。
- 結構改動要和前一版 App 相容：先加欄位，下一版才拿掉舊的。

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
- 過敏原與安全規則由程式再檢查一次，不只靠 AI。

**隱私**
- 管理後台只看統計與帳號資料，不能讀使用者的私人內容。
- 產品事件只記操作、不記內容，用分析 ID，不存使用者 ID。

## 環境與安全

- Supabase 正式專案 `dvlfioarakgddstcwfiu`、測試專案 `usnsgpcutztcmnjbqopg`（東京、免費方案）。
- 正式網站 https://tsu-siann.netlify.app（Netlify，從 `main` 自動部署；預覽網址連測試專案）。
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
