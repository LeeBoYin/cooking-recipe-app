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
