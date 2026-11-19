# 16 後端實作規格

**用途**：把 [04 架構](04-architecture.md) 與 [05 資料模型](05-data-model.md) 的設計整理成可以照著做的清單：資料表、外鍵、權限、資料庫函式、Edge Functions、觸發器、排程、金鑰。設計的理由與欄位意義仍以 04、05 為準；兩邊有出入時，先回頭修正設計文件，再改這份。

---

## 一、慣例

| 項目 | 規則 |
|------|------|
| 命名 | 資料表、欄位、函式一律 snake_case（`cooked_on`、`publish_recipe`）；05 的 camelCase 只是文件寫法。資料表用複數（`recipes`），字典表加 `dict_` 前綴 |
| 型別 | 用 `supabase gen types` 從資料庫產生 TypeScript 型別，放在 `packages/shared-types`；不手寫一份重複的型別 |
| ID | `uuid`，由手機或後端產生 UUID v7；後端檢查格式。新增一律「已經存在就略過」，重送不會產生兩筆 |
| 時間 | `timestamptz` 存時間點，`date` 存某一天；`created_at`、`updated_at` 由資料庫預設值與觸發器設定 |
| 列舉 | `text` 加 `CHECK`，不用 Postgres 的 `ENUM` |
| 內嵌 JSON | `jsonb`，寫入時用 `pg_jsonschema` 檢查；每個欄位帶 `schema_version` |
| 軟刪除 | `deleted_at`；唯一索引一律加 `WHERE deleted_at IS NULL` |
| 多步驟的動作 | 一律寫成資料庫函式（RPC），一次全部成功或全部不做 |

## 二、環境、擴充套件與金鑰

**環境**

| 環境 | 用途 |
|------|------|
| 本機 | Supabase CLI，開發與寫 migration |
| 測試 | 第二個 Supabase 免費專案；Netlify 預覽網址連到這裡；不放真實使用者資料 |
| 正式 | 第一個 Supabase 免費專案；Netlify 正式網址 |

**擴充套件**（M0 前驗證免費方案都能啟用，見 [06 技術驗證](06-roadmap.md#開工前的技術驗證)）

| 套件 | 用途 |
|------|------|
| `pg_cron` | 排程（到期提醒、週末靈感、每日維護） |
| `pg_net` | 從資料庫呼叫 Edge Function（送推播） |
| `pg_jsonschema` | 檢查內嵌 JSON 的格式 |
| `pgroonga` | 中文全文搜尋；不能用時退回 `pg_trgm` |
| `pgcrypto` | 邀請連結、好友連結的雜湊 |

**金鑰與設定**

| 名稱 | 存在哪裡 | 說明 |
|------|---------|------|
| `ANTHROPIC_API_KEY` | Supabase 的秘密設定（正式、測試各一把） | 只有 `ai`、`mcp` 函式讀得到；Claude Console 另設每月上限 |
| `VAPID_PRIVATE_KEY` | Supabase 的秘密設定 | 推播簽章；公開金鑰放前端的環境變數 |
| Google 登入的用戶端 ID 與密鑰 | Supabase Auth 設定 | 只做 Google 與密碼登入 |
| `FIRST_ADMIN_EMAIL` | Supabase 的秘密設定 | 第一位系統管理員 |
| `SUPABASE_ACCESS_TOKEN`、專案 ID | GitHub 的秘密設定 | GitHub Actions 部署 migration 與 Edge Functions |
| 資料庫連線字串（唯讀備份帳號） | GitHub 的秘密設定 | 每週備份用 |
| 備份加密的**公開**金鑰 | GitHub 的秘密設定 | 用非對稱加密：GitHub 只有公開金鑰、只能加密；解密的私密金鑰由你離線保管 |
| `SUPABASE_URL`、`SUPABASE_ANON_KEY` | Netlify 的環境變數 | 公開的，前端用 |

## 三、資料表

刪除時：**連動**＝一起刪；**空值**＝改成空；**佔位**＝指向「已刪除的使用者」；**限制**＝有資料時不能刪。

### 廚房與帳號

| 資料表 | 主鍵 | 外鍵（刪除時） | 階段 |
|-------|------|--------------|------|
| `user_profiles` | `user_id` | `auth.users`（連動） | M0 |
| `user_identities` | `user_id` | `auth.users`（連動） | M0 |
| `user_settings` | `user_id` | `auth.users`（連動）；`current_kitchen_id` → `kitchens`（空值） | M0 |
| `kitchens` | `id` | `created_by` → 使用者（佔位） | M0 |
| `kitchen_members` | `id` | `kitchen_id`（連動）；`user_id`（連動） | M0 |
| `household_profiles` | `id` | `kitchen_id`（連動） | M2 |
| `kitchen_join_codes` | `id` | `kitchen_id`（連動）；`created_by`、`used_by` → 使用者（空值） | M2 |
| `dietary_profiles` | `id` | `user_id`（連動）或 `household_profile_id`（連動） | M0 |
| `entitlements` | `user_id` | `auth.users`（連動） | M1a |
| `invites` | `id` | `invited_by`（佔位）；`kitchen_id`（連動）；`accepted_user_id`（空值） | M1a |
| `password_reset_links` | `id` | `user_id`（連動） | M1a |
| `waitlist_entries` | `id` | — | M2 |
| `push_subscriptions` | `id` | `user_id`（連動） | M2 |

### 食材與廚具

| 資料表 | 主鍵 | 外鍵（刪除時） | 階段 |
|-------|------|--------------|------|
| `pantry_items` | `id` | `kitchen_id`（連動）；`created_by`、`removed_by`（佔位）；`ingredient_id` → `dict_ingredients`（限制）；`removed_with_recipe_id`（空值） | M0 |
| `kitchen_equipment` | `id` | `kitchen_id`（連動）；`equipment_type_id` → `dict_equipment_types`（限制） | M0 |

### 食譜、收藏與對話

| 資料表 | 主鍵 | 外鍵（刪除時） | 階段 |
|-------|------|--------------|------|
| `recipes` | `id` | `user_id`（連動）；`kitchen_id`（空值）；`parent_recipe_id`（空值） | M0 |
| `recipe_private` | `recipe_id` | `recipes`（連動） | M0（口述 M1b） |
| `recipe_revisions` | `id` | `recipe_id`（連動） | M1b |
| `photos` | `id` | `user_id`（連動，廚具照片除外）；`kitchen_id`（連動，廚具照片） | M0 |
| `bookmarks` | `id` | `user_id`（連動）；`recipe_id`（空值，顯示「已收起來」）；`cooked_recipe_id`（空值） | M1a（朋友的食譜 M2） |
| `chef_conversations` | `id` | `user_id`（連動）；`kitchen_id`（空值） | M1a |
| `preference_profiles` | `user_id` | `auth.users`（連動） | M0 |
| `taste_profile_snapshots` | `user_id` | `auth.users`（連動） | M1a |
| `ai_suggestion_cache` | `id` | `user_id`（連動）；`conversation_id`（空值） | M1a |
| `share_links` | `id` | `recipe_id`（連動） | M2 |
| `user_ingredient_mappings` | `(user_id, raw_text_normalized)` | `user_id`（連動） | M0 |

### 社群（M2）

| 資料表 | 主鍵 | 外鍵（刪除時） |
|-------|------|--------------|
| `public_profiles` | `user_id` | `auth.users`（連動） |
| `public_taste_summaries` | `user_id` | `auth.users`（連動） |
| `friendships` | `id` | 兩位使用者（連動） |
| `friend_preferences` | `(user_id, friend_id)` | 兩位使用者（連動） |
| `reactions` | `id` | `user_id`（連動）；`recipe_id`（連動） |
| `comments` | `id` | `user_id`（連動）；`recipe_id`（連動）；`parent_comment_id`（保留，顯示「已刪除」） |
| `friend_shares` | `id` | 兩位使用者（連動）；`recipe_id`（連動） |
| `notifications` | `id` | `user_id`（連動）；`actor_id`（佔位） |

### 只在後端

| 資料表 | 階段 | 說明 |
|-------|------|------|
| `app_config` | M0 | 單列設定 |
| `error_logs` | M0 | ADR-21 |
| `ingredient_mappings` | M0 | 全站共用的食材對應快取（只來自 AI 與你的審查） |
| `background_jobs` | M1a | 背景任務佇列 |
| `ai_usage_records`、`ai_spend_monthly`、`ai_rate_counters`、`ai_usage_alerts` | M1a | AI 用量與保護 |
| `admin_audit_logs` | M1a | 只能新增 |
| `product_events`、`analytics_identities`、`product_metrics_monthly` | M1a | 產品數據 |
| `feedback`、`announcements` | M2 | |
| `feature_flags` | M3 | |
| `connected_ai_clients` | M4 | MCP |
| `content_reports`、`blocks` | 公開上線前 | 檢舉與封鎖 |

### 字典（唯讀）

`dict_ingredients`、`dict_allergens`、`dict_dietary_restrictions`、`dict_techniques`、`dict_equipment_types`、`dict_preference_dimensions`、`dict_quiz_items`、`dict_regions`、`dict_base_dishes`，以及記錄目前版本的 `dict_version`。

- 唯一來源是程式碼庫裡的字典檔；每次部署由 GitHub Actions 匯入（整批取代），使用者與 App 都不能寫。
- 字典 ID 永遠不刪、不改名；淘汰的標 `deprecated`（05 完整性規則），所以外鍵用「限制」不會擋到部署。

## 四、權限（RLS）

權限分四類（04 安全與隱私）。下表的「家人」＝和作者同屬任一廚房的人，「好友」＝已接受的好友；這些判斷寫成 `SECURITY DEFINER` 函式 `shares_kitchen(a, b)`、`is_friend(a, b)`、`can_view_recipe(viewer, recipe)`，每條規則都呼叫它們。

| 資料表 | 讀 | 新增 | 修改 | 刪除 |
|-------|----|------|------|------|
| `user_settings`、`preference_profiles`、`taste_profile_snapshots`、`chef_conversations`、`ai_suggestion_cache`、`recipe_private`、`user_ingredient_mappings` | 本人 | 本人（對話只由 `ai` 函式寫） | 本人 | 本人 |
| `user_identities` | 本人、家人、好友 | 註冊時自動 | 本人 | — |
| `dietary_profiles` | 本人；家人（本人選擇分享時）；家人檔案的由同廚房成員 | 本人；家人檔案的由廚房管理者 | 同新增 | 同新增 |
| `kitchens` | 成員 | 函式 | 管理者 | 函式（最後一位成員離開） |
| `kitchen_members` | 同廚房成員 | 函式（接受邀請） | 管理者改角色；本人改自己的提醒設定 | 函式（離開、移除） |
| `kitchen_join_codes` | 無（只經函式） | 函式 | 函式 | 函式 |
| `household_profiles` | 成員 | 管理者 | 管理者 | 管理者 |
| `pantry_items`、`kitchen_equipment` | 成員 | 成員（食材經 `add_pantry_items`） | 成員 | 成員 |
| `recipes` | `can_view_recipe`：作者；家人（household、friends）；好友（friends）；分享給他且沒收回的人。草稿只有作者 | 作者 | 作者（經 `save_recipe`） | 作者（軟刪除） |
| `recipe_revisions` | 作者 | 函式 | — | 連動 |
| `photos` | 依擁有者：食譜照片跟著食譜；廚具照片給廚房成員；頭像給本人、家人、好友 | 本人 | 本人；廚具照片給廚房成員 | 同修改 |
| `bookmarks` | 本人 | 本人（朋友的食譜要讀得到才能收藏） | 本人 | 本人 |
| `share_links` | 作者（公開頁由 `share` 函式以服務權限讀） | 作者 | 作者（撤銷） | 連動 |
| `reactions`、`comments` | 讀得到那篇食譜的人 | 讀得到那篇食譜的人 | 本人 | 本人；食譜作者可刪自己食譜下的留言 |
| `friendships`、`friend_preferences` | 當事人 | 函式（好友連結） | 當事人 | 當事人 |
| `friend_shares` | 送出與收到的人 | 作者 | 作者（收回）；收件人（已讀） | 作者 |
| `notifications` | 本人 | 觸發器 | 本人（已讀） | 本人 |
| `public_profiles`、`public_taste_summaries` | 本人、家人、好友 | 本人 | 本人 | 本人 |
| 只在後端的表 | 沒有（只有 Edge Function 以服務權限存取） | — | — | — |
| `dict_*` | 所有已登入的人 | — | — | — |

所有寫入另外檢查帳號狀態是「啟用中」。這張表也是 M2 前「社群權限的自動化測試」的依據（[08](08-open-items.md)）。

## 五、資料庫函式（RPC）

| 函式 | 誰能呼叫 | 做什麼 |
|------|---------|-------|
| `save_recipe` | 作者 | 新增或更新食譜（含草稿）；比對讀取時的 `updated_at`，不一致就拒絕；用字典表算出 `ingredient_ids`、`equipment_type_ids`、`techniques`、`difficulty.overall`、`cooked_dates`；做法改變時寫一版 `recipe_revisions`；檢查長度與照片上限 |
| `publish_recipe` | 作者 | 檢查有標題或照片、填 `published_at`、對好友與家人送「有新動態」訊號（Realtime Broadcast） |
| `record_cook_again` | 作者 | 新增一筆「又做了一次」，更新 `cooked_dates` |
| `add_pantry_items` | 廚房成員 | 一次加入多樣食材：已經有的只更新日期（保留較早的期限），沒有的新增；套用使用者自己的對應優先、全站對應其次 |
| `remove_pantry_item`、`restore_pantry_item` | 廚房成員 | 移除與復原 |
| `merge_kitchen_into` | 來源廚房的管理者，且是目標廚房的成員 | 把一個廚房的食材與廚具搬到另一個，同一種食材合併 |
| `leave_kitchen` | 成員 | 離開；最後一位管理者要先指定接手者；最後一位成員離開時軟刪除廚房 |
| `create_kitchen_join_code` | 廚房成員 | 產生 6 碼代碼（只回傳一次，資料庫存雜湊），10 分鐘後到期；同一個成員再產生時，舊的作廢 |
| `join_kitchen_by_code` | 已登入的人 | 先回傳廚房名稱與成員給使用者確認，確認後加入（成員身分）、標記代碼已用、通知廚房成員；每人失敗 5 次暫停 15 分鐘（記在速率計數表）；自己的空廚房一併刪除 |
| `set_member_role` | 廚房管理者 | 改角色；不能讓廚房沒有管理者 |
| `create_invite` | 廚房成員（廚房邀請）；系統管理員經 `admin` 函式（兩種都能發） | 檢查人數上限（含還沒過期的邀請）後建立邀請；`type` 為 `kitchen` 時檢查邀請者是那個廚房的成員。對方已經是使用者時，改成產生一則加入廚房的通知 |
| `delete_account` | 本人 | 依 04 的規則處理所有資料，參照改成「已刪除的使用者」，排入照片清理的背景任務 |
| `search_recipes` | 已登入的人 | PGroonga 查詢，只回傳讀得到的食譜與收藏 |
| `feed_page` | 已登入的人 | 朋友與家人的動態，用 `(published_at, id)` 游標分頁 |
| `bookmark_recipe`、`unbookmark_recipe` | 已登入的人 | 收藏時存下菜名快照 |
| `share_to_friend`、`revoke_friend_share` | 作者 | 分享與收回 |
| `toggle_reaction`、`add_comment`、`delete_comment` | 讀得到食譜的人 | 回覆只能一層 |
| `regenerate_friend_link`、`accept_friend_link`、`remove_friend` | 本人 | 好友連結與移除好友 |
| `mark_notifications_read` | 本人 | |
| `set_current_kitchen` | 本人 | 切換廚房 |

## 六、Edge Functions

| 函式 | 誰能呼叫 | 做什麼 |
|------|---------|-------|
| `ai` | 已登入、啟用中的使用者 | 任務：首頁點子、對話、展開做法、口述整理、用說的改食譜、從網址匯入、發佈後整理（標籤、難易度、一句話）、正規化、靈感彩蛋。每個任務的模型與 effort 讀設定檔（見 [03 模型選擇](03-ai-design.md#模型選擇)）。依序檢查帳號狀態、速率、合理使用上限、預算；口味檔案過期時先用 `core` 重算；組 prompt、呼叫 Claude、驗證輸出、過敏原與安全二次檢查、寫用量紀錄 |
| `accept-invite` | 持有邀請連結或邀請碼的人 | 新註冊（密碼）或已有帳號的人接受家人邀請；建立帳號與初始資料（見第八節）。另外兩個動作：打開邀請連結時產生 6 碼邀請碼（1 小時內有效）；在主畫面的 App 用邀請碼換回那筆邀請，錯誤 5 次暫停 15 分鐘 |
| `share` | 任何人（公開頁）；作者（建立） | 輸出公開分享頁；建立分享連結時存公開照片副本與手機產生的預覽圖 |
| `push` | 只有資料庫（`pg_net`）與排程 | 送 Web Push，清掉失效的訂閱 |
| `track` | 已登入的人 | 收產品事件與手機的錯誤紀錄，由後端填分析 ID 後寫入 |
| `admin` | 系統管理員（兩步驟驗證） | 後台的所有資料與操作，每次寫操作紀錄 |
| `maintenance` | 只有排程 | 需要 Storage API 的清理（孤兒照片、刪除帳號後的照片） |
| `mcp` | 經 OAuth 授權的外部 AI | M4 |

Supabase Auth 另設「建立使用者前」的 hook：Google 登入時檢查 email 有對應的有效邀請。

## 七、觸發器

| 觸發時機 | 做什麼 |
|---------|-------|
| 每張表新增、修改 | 設定 `created_at`、`updated_at` |
| `kitchen_members` 新增、修改、刪除 | 每人最多 5 個廚房、每廚房最多 10 人、至少一位管理者；產生廚房相關通知 |
| `reactions`、`comments`、`bookmarks`、`friend_shares`、`friendships` 新增 | 依收件人的通知開關產生通知；要推播的，排一筆 `push` 背景任務 |
| `comments` 新增 | 回覆只能一層 |
| `notifications` 新增 | Realtime 推給收件人的鈴鐺 |
| `pantry_items`、`kitchen_equipment` 變更 | Realtime 推給同廚房的成員 |
| `preference_profiles`、`recipes`、`bookmarks`、`ai_suggestion_cache`（回饋）、`pantry_items` 變更 | 把相關使用者的 `taste_profile_snapshots.stale` 設為真；實際重算在 `ai` 函式裡做 |

衍生欄位不靠觸發器，在 `save_recipe` 等函式裡一起計算，比較好測試。

## 八、註冊時建立的資料

| 情況 | 建立的資料 |
|------|-----------|
| 所有人 | `user_profiles`（啟用中）、`user_identities`、`user_settings`（介面語言、預設值）、`preference_profiles`（空的）、`entitlements`（依邀請的方案）、`analytics_identities`、`dietary_profiles`（空的） |
| 一般邀請、或你自己（M0） | 一個自己的廚房（預設名稱與手機的時區、地區，新手引導 ⑥-2 再確認），加上管理者身分；依邀請設定和邀請者成為好友 |
| 廚房邀請 | 新手引導 ⑥ 確認後加入邀請者的廚房（成員身分），不另外建自己的廚房；選了「建立自己的廚房」才建；預設和邀請者成為好友 |

全部在 `accept-invite` 裡的同一個資料庫函式完成；M0 的第一個帳號由部署時的初始化腳本建立。

## 九、排程

| 排程 | 頻率 | 做什麼 |
|------|------|-------|
| 到期提醒、週末靈感 | 每 15 分鐘（`pg_cron`） | 找出現在是當地提醒時間的廚房、週六早上的使用者，排入推播 |
| 背景任務 | 每分鐘 | 執行 `background_jobs` 裡到期的任務，失敗就退避重試 |
| 每日維護 | 每天凌晨 | 刪除超過 30 天的對話、90 天的通知與錯誤紀錄、過期的速率計數；軟刪除到期的資料；13 個月以上的產品事件與 AI 用量明細；AI 費用對帳 |
| 每月匯總 | 每月 1 日 | 產生上個月的 `product_metrics_monthly` |
| 喚醒與備份 | 每週（GitHub Actions） | 喚醒專案；加密備份資料庫到另一個 GitHub 私人儲存庫 |

每次執行的結果寫進 `error_logs`（`source: 'cron'`、`'backup'`），後台總覽顯示。

## 十、共用套件的限制

`packages/core`、`ingredients`、`equipment`、`shared-types` 要同時在前端（Vite）與 Edge Functions（Deno）執行：

- 只用標準 ESM 與標準 Web API，不用 Node 專用的模組（`fs`、`path`、`Buffer` 等）。
- 不依賴只在瀏覽器存在的東西（`window`、`localStorage`）。
- 兩邊各跑一次單元測試。

## 十一、建置順序

| 階段 | 先建 |
|------|------|
| M0 | 慣例與擴充套件、字典表與匯入、帳號與廚房相關表、食材、廚具、食譜（含私人表）、照片、口味地圖、`app_config`、`error_logs`；`save_recipe`、`publish_recipe`、`add_pantry_items`；權限規則與自動化測試；初始化腳本；喚醒與備份 |
| M1a | 邀請與 `accept-invite`、方案、`ai` 函式與用量保護、對話、點子快取、收藏（大廚的點子）、產品數據與 `track`、後台的 `admin`、背景任務 |
| M1b | 食譜版本、口述整理、匯入 |
| M2 | 社群各表與函式、家人檔案、分享連結與 `share`、通知與推播、`feed_page` |
| 之後 | 依各階段功能補上 |
