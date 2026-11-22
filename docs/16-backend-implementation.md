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
| 欄位授權 | 每張表先收回 API 角色（`anon`、`authenticated`）的所有權限，再只開放 App 可以直接改的欄位；其他欄位只經資料庫函式改 |
| 輔助函式 | 權限規則用的判斷放在 `private` schema（不經 API 公開），用 `SECURITY DEFINER` 並固定 `search_path` |
| 巢狀設定 | 05 的巢狀物件（例：`UserSettings.units`）攤平成欄位；內容常變、層數多的才用 `jsonb` |
| 權限測試 | pgTAP，放在 `supabase/tests/`；新增資料表時一起寫，CI 每次都跑 |

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
| `SUPABASE_ACCESS_TOKEN`、專案 ID | GitHub 的秘密設定 | GitHub Actions 部署 migration 與 Edge Functions |
| `MAINTENANCE_TOKEN` | 各專案的 Edge Function Secrets；GitHub 的秘密設定 `MAINTENANCE_TOKEN_STAGING`、`MAINTENANCE_TOKEN_PRODUCTION` | 呼叫 `maintenance` 的通行證，測試與正式各一組 |
| `BACKGROUND_JOBS_TOKEN` | 各專案的 Edge Function Secrets；另存一份在各專案資料庫的 Vault（名稱 `background_jobs_token`），Vault 另存函式網址（`background_jobs_url`，例 `https://<專案 ID>.supabase.co/functions/v1/background-jobs`） | 資料庫排程呼叫 `background-jobs` 的通行證與網址，測試與正式各一組；Vault 沒設就不派發（任務留在佇列）。設定步驟見 M1a-05 的 PR 說明 |
| `SUPABASE_URL`、`SUPABASE_ANON_KEY` | Netlify 的環境變數 | 公開的，前端用 |

## 三、資料表

刪除時：**連動**＝一起刪；**空值**＝改成空；**佔位**＝改成空值，畫面上顯示「已刪除的使用者」（不另外建一個假帳號）；**限制**＝有資料時不能刪。

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
| `dietary_profiles` | `id` | `user_id`（連動，唯一）；`household_profile_id`（連動，M2 建 `household_profiles` 時加上欄位，並讓兩者恰好一個有值） | M0（只有使用者的） |
| `entitlements` | `user_id` | `auth.users`（連動） | M1a：`plan`（`free`／`plus`）、`valid_until`、`fair_use_override`（管理員個別調整的合理使用上限，M1a-04 讀）；本人只能讀，寫入只經註冊（依邀請的方案，密碼與 Google 兩條路徑同一個交易）與 `admin_set_user_plan` |
| `invites` | `id` | `invited_by`（佔位）；`kitchen_id`（連動）；`accepted_user_id`（空值） | M1a |
| `password_reset_links` | `id` | `user_id`（連動） | M1a |
| `invite_code_attempts` | `source_hash` | — | M1a |
| `waitlist_entries` | `id` | — | M2 |
| `push_subscriptions` | `id` | `user_id`（連動） | M2 |

### 食材與廚具

| 資料表 | 主鍵 | 外鍵（刪除時） | 階段 |
|-------|------|--------------|------|
| `pantry_items` | `id` | `kitchen_id`（連動）；`created_by`、`removed_by`（佔位）；`ingredient_id` → `dict_ingredients`（限制）；`removed_with_recipe_id`（空值；`recipes` 建好後補外鍵） | M0 |
| `kitchen_equipment` | `id` | `kitchen_id`（連動）；`created_by`、`updated_by`（佔位）；`equipment_type_id` → `dict_equipment_types`（限制，自訂廚具為空） | M0 |

### 食譜、收藏與對話

| 資料表 | 主鍵 | 外鍵（刪除時） | 階段 |
|-------|------|--------------|------|
| `recipes` | `id` | `user_id`（連動）；`kitchen_id`（空值）；`parent_recipe_id`（空值） | M0 |
| `recipe_private` | `recipe_id` | `recipes`（連動） | M0（口述 M1b） |
| `recipe_revisions` | `id` | `recipe_id`（連動） | M1b |
| `photos` | `id` | `user_id`（連動，廚具照片為空）；`kitchen_id`（連動，廚具照片）；`created_by`（佔位） | M0（廚具、食譜、步驟照片、頭像；近況的寫入規則等好友關係建好再補） |
| `bookmarks` | `id` | `user_id`（連動）；`recipe_id`（空值，顯示「已收起來」）；`cooked_recipe_id`（空值） | M0（大廚的點子；朋友的食譜 M2） |
| `chef_conversations` | `id` | `user_id`（連動）；`kitchen_id`（刪廚房時設空） | M1a-07。一段對話一列：`messages`（jsonb，只經 `ai_chat_append` 附加）、`summary`、`turn_count`（0–20）、`mentioned_ingredients`、`preference_signals`（只算長期的進口味，M1a-10a）、`last_message_at`；`diners` 延後。最後一則訊息起算 30 天由每日維護刪除（`purge_old_chat_conversations`），對話的點子快取跟著刪 |
| `preference_profiles` | `user_id` | `auth.users`（連動） | M0 |
| `taste_profile_snapshots` | `user_id` | `auth.users`（連動） | M1a-10a。每人一列：`computed_at`、`stale`、`period`（目前只有 `all_time`）、`data`（`schemaVersion` 1，`dims`、`context`、`sources`，`pg_jsonschema` 檢查）。本人只能讀，只經 `taste_profile_save` 寫（只給 `service_role`）；沒有這一列當作過期，所以註冊時不預先建立 |
| `ai_suggestion_cache` | `id` | `user_id`（連動）；`kitchen_id`（刪廚房時設空）；`conversation_id`（空值，對話的點子用，M1a-07；連動刪除） | M1a-06（首頁點子；`drafts` M1a-09 起寫，`feedback` M1a-10a 起寫：收藏記 `bookmarked`、做了記 `recorded`，格式用 `pg_jsonschema` 檢查，同一個點子的同一種回饋只記一次） |
| `share_links` | `id` | `recipe_id`（連動） | M2 |
| `user_ingredient_mappings` | `(user_id, raw_text_normalized)` | `user_id`（連動） | M1a-05 |

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
| `app_config` | M0 | 單列設定：文字長度上限、照片張數上限、軟刪除保留天數；M1a-03 起加 AI 總開關 `ai_enabled`、每月預算 `ai_monthly_budget_usd`（預設 18）、降級提醒門檻 `ai_budget_alert_ratio`（預設 0.8）、`ai_protection`（用量保護的數值，M1a-04 定格式） |
| `error_logs` | M0 | ADR-21 |
| `ingredient_mappings` | M1a-05 | 全站共用的食材對應快取（只來自 AI 與你的審查）。主鍵 `raw_text_normalized`（`private.normalize_term`：全形轉半形、小寫、去空白，最長 60 字）；`ingredient_id` 為空表示 AI 看過、候選裡沒有合適的（不再重問）；`source` 是 `ai` 或 `admin`。使用者讀不到，只有資料庫函式能寫 |
| `background_jobs` | M1a-05 | 背景任務佇列。使用者不能讀寫。欄位：`kind`（目前只有 `normalize_ingredients`）、`dedupe_key`（詞的標準寫法；同一個詞排隊或執行中只會有一筆）、`payload`、`requested_by`（第一個排隊的人，AI 用量算在他身上）、`status`（`pending`／`running`／`done`／`dead`）、`attempts`／`max_attempts`（5）、`run_after`、`locked_at`、`last_error`（只存代號）。完成的 7 天後、放棄的 30 天後由 `purge_background_jobs` 刪除 |
| `ai_usage_records`、`ai_spend_monthly`、`ai_rate_counters`、`ai_usage_alerts` | M1a-04 | AI 用量與保護。四張表都沒有任何角色能直接存取，只經 `ai_guard_check`（呼叫前：全站預算 → 個人與方案的每日／每月上限 → 速率，同一個交易、列鎖原子計數）、`ai_record_usage`（呼叫後：寫紀錄、累加每月累計、80%／100% 提醒、異常偵測）與 `admin_*`；格式與預設值見 05 `aiProtection` 與 03〈用量保護〉。每日維護清過期的速率計數與 13 個月前的明細 |
| `admin_audit_logs` | M1a | 管理員每個寫入操作的紀錄（誰、何時、做了什麼；`detail` 只放代號、數字與設定的前後值，不放 email 與 token）。只能新增：沒有任何角色能直接讀寫，修改、刪除、清空由觸發器擋下（連資料庫擁有者也一樣）；`admin_user_id` 不設外鍵，免得刪帳號時被「不能修改」擋住 |
| `product_events`、`analytics_identities`、`product_metrics_monthly` | M1a | 產品數據 |
| `feedback`、`announcements` | M2 | |
| `feature_flags` | M3 | |
| `connected_ai_clients` | M4 | MCP |
| `content_reports`、`blocks` | 公開上線前 | 檢舉與封鎖 |

### 字典（唯讀）

`dict_ingredients`、`dict_allergens`、`dict_dietary_restrictions`、`dict_techniques`、`dict_equipment_types`、`dict_preference_dimensions`、`dict_quiz_items`、`dict_regions`、`dict_base_dishes`，以及記錄目前版本的 `dict_version`。

- 唯一來源是程式碼庫裡的字典檔；每次部署由 GitHub Actions 匯入（整批取代），使用者與 App 都不能寫。
- 匯入：`scripts/dictionaries-sql.ts` 把字典檔轉成一行 `select private.import_dictionaries(…)`，在同一個交易裡更新所有字典表並記下版本（字典內容的雜湊，存在 `dict_version`）。部署時先套用 migration，再用 `psql` 經連線池執行；本機的 `pnpm db:reset` 會一起匯入。
- 舊食譜的食材回填：食材沒有解析欄位的舊食譜，部署時在匯入字典之後，由 `scripts/unparsed-recipes.sql` 查出、`scripts/backfill-ingredients-sql.ts` 用 `core` 的解析器算好，再逐篇呼叫 `backfill_recipe_ingredients`（只有 `service_role` 能呼叫；同樣先檢查，原文在中間被改過就不回填）。解析結果沒變的食譜不會被改，所以可以重複執行。
- 匯入時再檢查一次：ID 不能從字典檔消失、陣列裡參照的 ID（例：食材的過敏原）都要存在、名稱一定要有繁中。
- ID 與 key 的格式：一般字典用小寫英文加連字號（`soy-sauce`）；口味維度的 key 用點分層（`cuisine.southeast_asia.thai`，第一段是群組，上層可以跨群組）；題目 ID 用底線（`card_tom_yum`）；地區代碼用 ISO（`TW`、`US-CA`），`kitchens.region` 不加外鍵，只檢查格式。
- 匯入時再檢查：題目的 `mapping` 只能指向存在的維度；題目與菜色的地區、後續題目、排除的過敏原與飲食限制、菜色的菜系／食材／手法／廚具、地區的常見食材都要存在。
- 字典表跟著用到它的功能建：食材、過敏原、飲食限制先建；廚具與手法跟著廚具，口味維度與題庫跟著口味地圖，地區與基礎菜色跟著推薦。
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
| `pantry_items` | 成員 | 函式（`add_pantry_items`） | 成員只能改放哪裡、想先用掉、期限、備註（只改「有」的）；其他欄位與狀態經函式 | 函式（移除與復原改狀態；超過 30 天的由每日維護刪除） |
| `kitchen_equipment` | 成員 | 成員 | 成員（不能改所屬廚房；選配手法只能是字典列出的，由觸發器檢查） | 成員 |
| `recipes` | `can_view_recipe`：作者；家人（household、friends）；好友（friends）；分享給他且沒收回的人。草稿只有作者 | 作者（經 `save_recipe`） | 作者（經 `save_recipe`） | 作者（經 `delete_recipe` 軟刪除） |
| `recipe_revisions` | 作者 | 函式 | — | 連動 |
| `photos` | 依擁有者：食譜照片跟著食譜；廚具照片給廚房成員；頭像給本人與同廚房的成員（M2 起加好友），路徑 `users/{userId}/avatar/`。私有 bucket `photos` 的 Storage 規則依路徑前綴判斷（`users/{userId}/` 本人、`kitchens/{kitchenId}/` 廚房成員），路徑格式不對一律拒絕；`users/{userId}/` 底下的食譜與步驟照片，另外開放給讀得到那篇食譜的人（由路徑裡的照片 ID 找到資料列，再用 `can_view_recipe` 判斷） | 本人；廚具照片給廚房成員。食譜與步驟照片只經 `save_recipe` 的 `p_photos` 建立、頭像只經 `set_avatar` 建立（手機不能直接寫），只能掛在自己沒刪除的食譜上；三個檔案都已在 Storage 才能建立資料列（頭像只有 400px 一個檔，資料列的三個路徑欄位都指向它：`users/{userId}/avatar/{照片ID}.webp`）；路徑必須是由 ID 與擁有者決定的固定格式；一件廚具一張；每篇食譜一張封面；張數上限由觸發器檢查 | 廚具照片只能改排序與封面；食譜與步驟照片經 `save_recipe` | 同新增；廚具刪除時資料列由觸發器一起刪，檔案由 `maintenance` 掃孤兒檔 |
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
| `save_recipe` | 作者 | 新增或更新食譜（含草稿），只送有改的欄位；ID 還不存在時新增一篇草稿；比對讀取時的 `updated_at`，不一致就拒絕；用字典表算出 `ingredient_ids`、`equipment_type_ids`、`techniques`、`difficulty.overall`、`cooked_on`（料理時間改變時才重算，用食譜所在廚房的時區；沒指定廚房時用目前的廚房）、`cooked_dates`；做法改變時 `version` 加一（M1b 起同時寫一版 `recipe_revisions`）；依 `app_config.text_limits` 檢查長度；刪掉已經不在步驟裡的步驟照片資料列（檔案由孤兒檔清理處理）；步驟最多 `app_config.max_steps` 步；`p_photos`（選填）是這篇食譜上方照片與步驟照片的完整清單：不在清單裡的刪除、新的建立、順序依清單，上方照片的第一張設為封面，張數依 `photo_limits` 檢查；食材每一列的 `ingredient_id`、`amount`、`amount_max`、`unit` 由手機用 `core` 的解析器從原文算出後送來（中文原文不適合在資料庫裡解析），資料庫只檢查：食材 ID 在字典裡、單位在 `UnitCode` 清單裡、數量是正數且上限不小於下限，不合格的欄位清空、保留原文；這些欄位只影響自己食譜的顯示與換算，M1a 起對不到字典的再交給背景的食材正規化補上；可以一起存 `recipe_private`，兩張表同一個交易 |
| `set_avatar` | 本人 | 換大頭貼：`p_photo_id` 是新照片的 ID，400px 的檔案要已經在 `users/{userId}/avatar/` 底下才能建立資料列；同一個交易裡刪掉本人舊的頭像資料列（檔案由孤兒檔清理處理）。傳 `null` 代表拿掉大頭貼 |
| `publish_recipe` | 作者 | 檢查有標題且至少一張照片（否則 `recipe_empty`）、改成已發佈、第一次發佈時填 `published_at`；M2 起對好友與家人送「有新動態」訊號（Realtime Broadcast，和 `feed_page` 一起做） |
| `delete_recipe`、`restore_recipe` | 作者 | 軟刪除與復原；`app_config.soft_delete_retention_days` 內可以復原，到期後由每日維護真正刪除 |
| `search_my_recipes` | 已登入、啟用中的使用者 | 以關鍵字找自己已發佈、未刪除的食譜：比對名稱與食材原文（不分大小寫，`%`、`_` 當一般字元），回傳食譜 ID、符合的是名稱還是食材、符合的文字，最多 200 筆。M0 用 `ilike`，之後換 PGroonga 時介面不變 |
| `record_cook_again` | 作者 | 新增一筆「又做了一次」，更新 `cooked_dates` |
| `add_pantry_items` | 廚房成員 | 一次加入多樣食材（最多 100 樣）：已經有的只更新加入日期（保留較早的期限），沒有的新增；放哪裡沒指定時用字典的預設，對應不到字典就放 `pantry`；同一個 ID 重送不會重複新增。沒給 `ingredient_id` 時，食材對應到字典的順序：使用者自己的對應（`user_ingredient_mappings`，蓋過手機送來的 ID）→ 手機送來的 `ingredient_id`（手機比對字典的結果）→ 全站對應（`ingredient_mappings`）→ 都對不到就保留原文並排進 `background_jobs`（M1a-05）。食譜食材同一套順序，用每列的 `name`（解析器拆出的食材名字）：`clean_recipe_ingredients` 在 `save_recipe` 裡補 `ingredient_id` 與排隊，不動原文 |
| `set_my_ingredient_mapping`、`clear_my_ingredient_mapping` | 已登入、啟用中的使用者 | 使用者手動修正（M1a-05）：把一個詞對應到字典食材（不能是不存在或已淘汰的）。寫進自己的 `user_ingredient_mappings`，同時把自己已存的食材（`created_by`）與食譜食材（`user_id`）裡同一個詞的 `ingredient_id` 改掉（原文不動；同一廚房已有同樣食材的略過）；不影響別人與全站對應。`clear_` 只拿掉對應，已存的維持現狀 |
| `claim_background_jobs`、`complete_normalization_jobs`、`fail_background_job`、`release_background_jobs` | 只有 `service_role`（`background-jobs` 函式） | 領一批到期的任務（執行中超過 10 分鐘視為中斷）；回報結果（寫全站對應、回填、標完成；已有的全站對應不蓋掉）；失敗（2、4、8、16 分鐘退避，次數用完標 `dead`）；暫時不能處理時放回佇列（不算一次嘗試）。回填只改 `ingredient_id`（食材 `ingredient_id` 空的、食譜每列 `name` 相符且沒有 `ingredient_id` 的），重算食譜的 `ingredient_ids`，不改原文、不動 `updated_at`，略過自己有同一個詞對應的人 |
| `remove_pantry_item`、`restore_pantry_item` | 廚房成員 | 移除與復原；復原時同一種食材已經又被加回來，就併進現有那一筆（保留較早的加入日期與期限），被復原的那一筆維持移除 |
| `merge_kitchen_into` | 來源廚房的管理者，且是目標廚房的成員 | 把一個廚房的食材與廚具搬到另一個，同一種食材合併 |
| `create_kitchen` | 已登入的人 | 建立廚房，呼叫的人成為管理者；時區與地區用手機送來的值（檢查是有效的時區與地區代碼）；同一個 ID 重送不會重複建立；回傳廚房，由手機接著切換過去 |
| `leave_kitchen` | 成員 | 離開；最後一位管理者要先指定接手者；最後一位成員離開時軟刪除廚房 |
| `create_kitchen_join_code` | 廚房成員 | 產生 6 碼代碼（只回傳一次，資料庫存雜湊），10 分鐘後到期；同一個成員再產生時，舊的作廢 |
| `join_kitchen_by_code` | 已登入的人 | 先回傳廚房名稱與成員給使用者確認，確認後加入（成員身分）、標記代碼已用、通知廚房成員；每人失敗 5 次暫停 15 分鐘（記在速率計數表）；自己的空廚房一併刪除 |
| `set_member_role` | 廚房管理者 | 改角色；不能讓廚房沒有管理者 |
| `create_invite` | 系統管理員經 `admin` 函式；服務權限（本機用 `scripts/create-invite.sh`）；廚房成員發廚房邀請 M2 才開放 | 檢查人數上限（已註冊加上還沒過期的待接受邀請）後建立邀請，回傳邀請 ID 與原始 token（只此一次，資料庫只存 SHA-256 雜湊）；email 存小寫；14 天有效；同一個 email 還有沒過期的待接受邀請時拒絕（`invite_pending_exists`），過期的舊邀請改成已撤銷；已註冊的 email 拒絕（`already_registered`）。M1a 只發一般邀請，`type = 'kitchen'` 回 `invite_type_unsupported`（M2 才做）；`befriend_inviter` 只存旗標，M2 建好友關係時照旗標補上。對方已經是使用者時改成產生一則加入廚房的通知（M2） |
| `setup_new_user` | 只有後端（初始化腳本、`accept-invite`） | 建立註冊時的資料（見第八節）；重複呼叫不會多建一份 |
| `complete_invite_signup` | 只有後端（`accept-invite`） | 同一個交易裡先認領邀請（待接受、沒過期、一般邀請，否則 `invite_not_usable`）、再呼叫 `setup_new_user`，並記下 `user_profiles.invite_id`；整段失敗時呼叫端刪掉剛建立的 Auth 使用者 |
| `set_invite_code` | 只有後端（`accept-invite`） | 把 6 碼邀請碼的雜湊存進邀請（`invites.code_hash`、`code_expires_at`，1 小時後到期）；同一筆邀請再產生時覆蓋舊的；邀請已用掉、撤銷、過期或不是一般邀請時 `invite_not_usable` |
| `redeem_invite_code` | 只有後端（`accept-invite`） | 用邀請碼的雜湊換回邀請，回傳 `ok`／`invalid`／`locked`。來源（連線 IP 的雜湊，不存原始 IP）15 分鐘內錯 5 次就暫停 15 分鐘，次數與暫停時間記在 `invite_code_attempts`，暫停中連對的碼也不收；成功不會清掉失敗次數。邀請碼到期、邀請用掉或撤銷時一起失效 |
| `hook_before_user_created` | 只有 Supabase Auth（Auth hook） | 見第六節末的說明 |
| `complete_google_signup` | 已登入的人（Google 登入後第一次） | 用登入者自己的 `auth.users` 資料（email 要已驗證、登入方式含 Google，不信任手機送的 email）找對應的待接受、沒過期的一般邀請，同一個交易裡認領邀請（`accepted_via = 'google'`）並呼叫 `setup_new_user`；時區、地區、暱稱用手機送來的值。已經初始化的人重複呼叫回傳現有的廚房；沒有可用的邀請時 `invite_not_usable` |
| `create_password_reset_link` | 系統管理員經 `admin` 函式；服務權限（本機用 `scripts/create-password-reset.sh`） | 為啟用中的使用者產生重設密碼連結，回傳原始 token（只此一次，資料庫只存 SHA-256 雜湊）；24 小時有效；同一個人先前還沒用的連結同時作廢；使用者不存在或已停用回 `user_not_found` |
| `claim_password_reset_link`、`release_password_reset_link` | 只有後端（`accept-invite`） | 用掉連結：還沒用過、沒過期、帳號啟用中才成功並回傳使用者 ID，同時標成已用，所以同一條連結只能用一次；改密碼失敗（例如密碼太弱）時 `release` 還回去，讓對方換個密碼再試 |
| `admin_*`（`admin_is_admin`、`admin_list_users`、`admin_list_invites`、`admin_get_config`、`admin_list_audit_logs`、`admin_create_invite`、`admin_regenerate_invite`、`admin_revoke_invite`、`admin_extend_invite`、`admin_update_invite_email`、`admin_set_user_status`、`admin_create_reset_link`、`admin_update_config`） | 只有服務權限（`admin` Edge Function） | 後台的讀取與操作。第一個參數是管理員的 ID，每個函式先確認它是啟用中的系統管理員（雙重保險）。寫入函式在同一個交易裡檢查、操作、寫 `admin_audit_logs`，失敗就整個不做、不留紀錄。讀取只回傳帳號資料與統計（使用者清單：email、暱稱、角色、狀態、註冊時間、最後使用時間、加入方式；邀請清單：狀態分待接受／已接受／已過期／已撤銷）。停用帳號時 Auth 的封鎖由 `admin` 函式另外處理，不能停用自己或另一位系統管理員。系統設定目前只有 `max_users`（1–1000）與 `soft_delete_retention_days`（1–365） |
| `delete_account` | 本人 | 依 04 的規則處理所有資料，別人資料裡的參照改成空值（顯示「已刪除的使用者」），排入照片清理的背景任務 |
| `search_recipes` | 已登入的人 | PGroonga 查詢，只回傳讀得到的食譜與收藏 |
| `feed_page` | 已登入的人 | 朋友與家人的動態，用 `(published_at, id)` 游標分頁 |
| `bookmark_ai_idea` | 已登入的人 | 收藏 AI 想的點子（首頁或對話，沒有 `baseDishId`）：傳點子所在的快取列 id 與菜名，理由與主要食材由那一列讀；同一則點子＋同一個菜名每人一筆（再收藏回傳既有那筆） |
| `ai_expand_get`、`ai_expand_save` | 只給 `service_role`（`ai` 函式） | M1a-09 展開做法。`ai_expand_get(p_user, p_suggestion, p_idea, p_bookmark)` 讀點子本身（快取列加點子 ID，或收藏）、已經展開的做法（快取的 `drafts` 優先，沒有就用收藏的 `recipeDraft`）、對應的收藏、平常煮幾人份；不是本人的、不存在的回空。`ai_expand_save(p_user, p_cache, p_idea_id, p_bookmark, p_draft)` 把做法存進快取列的 `drafts`，點子已經收藏就同時存進收藏的 `recipeDraft`；`p_draft` 不是物件回 `22023` |
| `ai_chat_get`、`ai_chat_append` | 只給 `service_role`（`ai` 函式） | `ai_chat_append` 在同一個動作中附加「使用者的話＋大廚的回應」、建立點子快取列、更新摘要與說過的食材；`p_conversation` 空的就開新的一段（可帶上一段的摘要）；滿 20 輪回 `23514`；不是本人的回 `P0002` |
| `record_bookmark_cooked` | 已登入的人 | 從收藏的點子按「做了，記錄一篇」、存檔成功後呼叫：把收藏連到自己那一篇食譜（`cookedRecipeId`，只能連自己還在的），同一個動作在點子的快取還在時記一筆 `recorded` 回饋；重複呼叫不會多記。`bookmarks.cooked_recipe_id` 不能再由手機直接改 |
| `taste_profile_save` | 只給 `service_role`（`ai` 函式） | 存重算好的口味檔案；`p_read_at` 是讀原始資料的時間，讀完之後觸發器又把這一列標成過期的，維持過期，下次再算 |
| `bookmark_recipe`、`unbookmark_recipe` | 已登入的人 | 收藏時存下菜名快照；大廚的點子另存理由與 `baseDishId`，同一道家常菜每人只能收藏一筆（再收藏回傳既有那筆）；`ideaIngredientIds` 由家常菜的主要食材算出，不信任手機送來的值。`bookmark_recipe` 可帶 `p_suggestion_id`＋`p_idea_id`，`bookmark_ai_idea` 傳的快取列也一樣：那個點子已經展開過做法就從快取讀出來一起存進 `recipeDraft`，並記下 `origin`（快取列與點子 ID，點子真的在那一組裡才記，不信任手機送來的 ID）、在快取寫一筆 `bookmarked` 回饋（不信任手機送來的內容）；`idea` 的其他欄位收藏後不能改，只有 `recipeDraft` 可以由後端補 |
| `share_to_friend`、`revoke_friend_share` | 作者 | 分享與收回 |
| `toggle_reaction`、`add_comment`、`delete_comment` | 讀得到食譜的人 | 回覆只能一層 |
| `regenerate_friend_link`、`accept_friend_link`、`remove_friend` | 本人 | 好友連結與移除好友 |
| `mark_notifications_read` | 本人 | |
| `set_current_kitchen` | 本人 | 切換廚房 |

## 六、Edge Functions

| 函式 | 誰能呼叫 | 做什麼 |
|------|---------|-------|
| `ai` | 已登入、啟用中的使用者 | 任務：首頁點子、對話、展開做法、口述整理、用說的改食譜、從網址匯入、發佈後整理（標籤、難易度、一句話）、正規化、靈感彩蛋。每個任務的模型與 effort 讀設定檔（見 [03 模型選擇](03-ai-design.md#模型選擇)）。依序檢查帳號狀態、速率、合理使用上限、預算；口味檔案過期時先用 `core` 重算；組 prompt、呼叫 Claude、驗證輸出、過敏原與安全二次檢查、寫用量紀錄。

骨架（M1a-03）：請求 `{ task, input }`，回應 `{ data }` 或 `{ error: <代號> }`；不開閘道的 JWT 驗證，自己用 Auth 驗證 token。主流程在 `functions/ai/pipeline.ts`（Claude、資料庫與任務都由外面傳入，單元測試用假的回應）：已登入（401 `unauthorized`）→ 帳號啟用中、沒被暫停 AI、AI 總開關開著（`ai_get_context`：`account_inactive`／`ai_paused`／`ai_disabled`）→ 任務在白名單（`unknown_task`；已列出但還沒實作的任務與正式環境的內部任務是 `task_not_available`）→ 輸入格式與長度（`invalid_input`）→ 【用量保護的掛載點 `guard`：M1a-04 在這裡檢查速率 `rate_limited`、合理使用上限 `over_limit`、預算 `budget_exhausted`，也可以改寫這次的模型設定做降級】→ 組 prompt（`stable` 在最前面、加 `cache_control`；`volatile` 接在後面）→ 呼叫 Claude（官方 SDK，`output_config.format` 結構化輸出、`output_config.effort`，Haiku 5.5 的抽取類任務 `thinking: disabled`）→ `stop_reason`：`refusal` 是 `refused`、`max_tokens` 是 `truncated`、其他非正常結束與不是合法 JSON 或不符 schema 是 `invalid_output`、Claude 服務出錯是 `upstream_error`（前端一律走不用 AI 的退路）→ 回傳輸出與 token 用量（輸入、輸出、快取讀、快取寫），用量交給 `onUsage` 掛載點，寫進用量紀錄。

用量保護（M1a-04，`functions/ai/usage.ts`＋資料庫函式）：`guard` 呼叫 `ai_guard_check`，回傳 `budget_exhausted`（全站用到 100%，含背景任務）、`over_limit`（個人合理使用上限，同時寫 `ai_usage_alerts`）、`rate_limited`（每分鐘 6／每小時 60，背景任務不算）；全站用到 80% 時依 `_shared/ai-models.ts` 的 `BUDGET_DEGRADE` 覆寫設定（首頁點子改 Haiku 5.5 關思考、靈感彩蛋回 `budget_exhausted` 讓前端用模板，對話不變）。檢查本身出錯時不放行（回 `server_error`，前端走不用 AI 的退路）。`onUsage` 用價格表（`MODEL_PRICES`，每百萬 token 的美元）算費用後呼叫 `ai_record_usage`，寫失敗只記錯誤代號、不影響回應。輸入的 SHA-256 前 32 碼與長度比例、JWT 的 `session_id` 供異常偵測用，不存內容。背景任務佇列在排隊前呼叫 `ai_budget_state()`（`ok`／`degraded`／`exhausted`），`exhausted` 時暫停。沒有設 `ANTHROPIC_API_KEY` 是 500 `not_configured`。紀錄只有任務與錯誤代號，不含使用者輸入與 AI 的回應。

首頁點子（M1a-06，`functions/ai/home/`）：`index.ts` 遇到任務 `home_ideas` 時交給 `home/handler.ts`，其他任務照舊走 `runAi`。handler 先檢查帳號與開關，呼叫 `ai_home_context(p_user)`（只給 `service_role`，一次讀齊口味、飲食限制、現在廚房的食材與廚具、自己最近 200 篇已發佈的食譜、最近的首頁點子；M1a-10a 起另附口味快照，過期或不存在時再附上重算用的原始資料：收藏的點子與對話裡的偏好），用 `core` 的規則評分（`env.ts`，和手機同一份）算出前 15 名候選，再走新手門檻 → 快取 → `runAi`（任務定義是這一次才組好的 prompt 與 schema，所以用量保護、預算降級、停用都照常套用）→ `check.ts` 的程式再檢查 → `ai_home_cache_save`（每人只留最近 6 筆）。請求 `{ shuffle?: boolean }`，回應 `{ data: HomeIdeasResponse }`（`ok`、`not_enough`、`rules`，格式在 `core/ideas/ai-types.ts`）或錯誤代號；檢查後一個都不剩回 `invalid_output`。`dietary_profiles` 的過敏原、飲食原則、不吃的食物、不用料理酒一改，觸發器清掉這個人的點子快取。後端的程式直接用相對路徑匯入 `packages/`（本機 Edge Runtime 驗證過；雲端打包第一次部署時確認）。評估集與實跑指令見 `home/eval/`。

和大廚聊聊（M1a-07，`functions/ai/chat/`）：任務 `chat` 同樣由 `index.ts` 交給 `chat/handler.ts`。輸入 `{ message, conversationId?, continueFrom?, wantIdeas? }`（`wantIdeas`：按了「直接給我點子」）（`message` 每則上限 500 字；`conversationId` 接著聊，`continueFrom` 是滿 20 輪的那一段，新的一段從它的條件摘要開始）。流程：帳號與開關 → `ai_chat_get` → `ai_home_context`（和首頁同一份資料）→ `chat/env.ts` 在首頁的環境上依這段對話說過的食材調整 L1 候選 → `chat/prompt.ts`（stable 與 volatile 一起快取，最近 10 輪原文加摘要，這一則的食材與候選放在最後一則使用者的話前面）→ `runAi`（串流呼叫 Claude、收完整段）→ `chat/check.ts`（點子走首頁同一套 `checkHomeOutput`，另外檢查大廚的話、反問、說過的食材、偏好訊號、摘要）→ 太早給點子（還不到 3 輪、使用者沒要求）或點子用到的提到食材太少時，帶 `retryHint` 重寫一次（M1a-09f；輪數由程式看對話裡大廚回應了幾次）→ `ai_chat_append`（`p_ask` 是 `{ question, options, multi }` 的 jsonb，沒有反問就 null）→ 回傳 `ChatResponse`。輸出 schema 每次都一樣；回應沒過檢查（`reply` 帶單位的數字、碰到排除清單，或給了點子卻一個都不剩）回 `invalid_output`，什麼都不存。使用者說的食材不寫進食材，只放在這段對話的 `mentioned_ingredients`，點子可以用，存成 `usesMentionedIds`。

展開做法（M1a-09，`functions/ai/expand/`）：任務 `expand_steps` 由 `index.ts` 交給 `expand/handler.ts`。輸入 `{ suggestionId, ideaId }`（首頁或對話的點子）或 `{ bookmarkId }`（收藏的點子），其他一律 `invalid_input`；自己的食譜（候選是 `own:`）也是 `invalid_input`，手機直接打開食譜。流程：帳號與開關 → `ai_expand_get`（點子與已經展開的做法）→ `ai_home_context` → 已經展開過的重新檢查過敏原與限制，過了就直接回（來源 `cache`，不呼叫 AI、不算用量；點子後來才收藏就補存進收藏）→ `expand/prompt.ts`（stable 固定、volatile 放語氣、口味、排除清單、廚具與當地的中心溫度表，這個點子與手邊食材在最後）→ `runAi`（照常過 `guard`／`onUsage`）→ `expand/check.ts` → 沒過就整份重寫一次（只告訴 AI 哪一類沒過）→ `ai_expand_save` → 回傳 `ExpandResponse`。輸出 schema 每個人都一樣（單位的 enum 固定為公制與計數單位）。失敗（逾時、AI 不能用、兩次都沒過）回錯誤代號、什麼都不存。舒肥的安全表（`packages/equipment/safety/*/sous-vide-presets.json`）目前是空的，所以任何舒肥步驟都會被擋下。

口味檔案（M1a-10a，`functions/ai/taste.ts`）：首頁、對話、展開做法讀口味前都先呼叫 `withMergedTaste`：快照新鮮就直接用；過期或不存在就用 `core` 的 `computeTasteProfile` 重算，經 `taste_profile_save`（帶讀取時間）存回去，存失敗只記代號、這一次照用算好的。算出來的合併口味放進 `buildHomeEnv`，首頁快取的雜湊用它，所以口味變了不沿用舊點子。收藏的家常菜用基礎菜色的菜系、食材、手法；AI 想的點子只有主要食材。

模型設定檔在 `functions/_shared/ai-models.ts`：每個任務的模型、effort、思考開關（`adaptive`／`off`）、輸出上限；改這個檔就換模型。`admin` 函式的 `get_ai_models` 唯讀顯示它（不含內部任務）。任務的輸入檢查、prompt、輸出 schema 登記在 `functions/ai/tasks.ts`；目前只有內部測試用的 `_selftest`，只有環境變數 `AI_ALLOW_INTERNAL_TASKS=true`（本機與測試專案）才能呼叫，正式專案不設。輸出用 `_shared/json-schema.ts` 的小型驗證器檢查（不用 ajv：它靠 `new Function`，Edge Runtime 不保證能跑）。|
| `accept-invite` | 持有邀請連結或邀請碼的人 | 新註冊（密碼）或已有帳號的人接受家人邀請；建立帳號與初始資料（見第八節）。密碼註冊：驗證 token（存在、沒撤銷、沒用過、沒過期、email 相符，不分大小寫）→ 用 admin API 建立已確認 email 的使用者（不寄信）→ `complete_invite_signup`；失敗時刪掉剛建的使用者，回應與紀錄不含 email 與 token。用 `body.action` 分四個動作（沒填當作 `signup`）：
- `signup`：同上，驗證邀請的憑證可以是連結的 `token`，也可以是 6 碼 `code`（走 `redeem_invite_code`，一樣計錯誤次數）。
- `open`：打開邀請連結時，驗證 token 後產生 6 碼邀請碼（字母表去掉 0/O、1/I/L，1 小時內有效，只存雜湊，重新產生時舊的作廢），回傳邀請碼、邀請的 email 與邀請者的暱稱（`inviterName`，沒有邀請者時是空值；用 `invite_inviter_name` 取，只回暱稱），邀請頁顯示「〇〇邀請你一起用…」。
- `redeem_code`：在主畫面的 App 用邀請碼換回那筆邀請（回傳 email 與 `inviterName`，讓註冊畫面帶入）；來源錯 5 次暫停 15 分鐘，回應 `code_locked` 與 `lockedUntil`（HTTP 429）。「來源」是連線 IP（優先 `cf-connecting-ip`）的 SHA-256，只存雜湊。
- `reset_password`：用管理員產生的重設連結（`token`）與新密碼改密碼：`claim_password_reset_link` → admin API 改密碼，失敗就 `release_password_reset_link`；連結不存在、過期、用過或帳號已停用都回 `invalid_link`。

這個函式不開 JWT 驗證。|
| `share` | 任何人（公開頁）；作者（建立） | 輸出公開分享頁；建立分享連結時存公開照片副本與手機產生的預覽圖 |
| `push` | 只有資料庫（`pg_net`）與排程 | 送 Web Push，清掉失效的訂閱 |
| `track` | 已登入的人 | 收產品事件與手機的錯誤紀錄，由後端填分析 ID 後寫入 |
| `admin` | 系統管理員（兩步驟驗證） | 後台的所有資料與操作（含 `set_user_plan` 調整方案、`get_ai_models` 唯讀看各任務的模型，`update_config` 可改 AI 總開關與每月預算），每次寫操作紀錄。不開閘道的 JWT 驗證，自己依序檢查：token 交給 Auth 驗證（401 `unauthorized`）→ 是啟用中的系統管理員（403 `forbidden`，不是管理員的人只看到這個）→ JWT 的 `aal` 是 `aal2`（403 `mfa_required`，前端據此引導綁定或輸入驗證碼）。`body.action`：`get_config`、`list_users`、`list_invites`、`list_audit_logs`、`create_invite`、`regenerate_invite`、`revoke_invite`、`extend_invite`、`update_invite_email`、`set_user_status`、`create_reset_link`、`update_config`；AI 用量保護（M1a-04）：`get_ai_protection`、`update_ai_protection`、`set_user_fair_use`（個人每日／每月上限覆寫，`clear` 回到方案的值）、`set_user_ai_paused`、`list_ai_alerts`（`open`／`resolved`／`all`）、`resolve_ai_alert`、`get_ai_usage`（本月用量與預算進度、Console 硬上限對照、依任務與模型拆分、使用者排行），寫入都留操作紀錄；邀請與重設連結只回傳原始 token（只此一次），由前端組成網址。資料庫錯誤對應成代號（`invite_not_usable`、`invite_pending_exists`、`already_registered`、`invite_capacity`、`cannot_target_self`…），沒見過的一律 `server_error`，回應與紀錄不含 email 與 token。`is_system_admin()`（RLS 與 `create_invite` 等用的判斷）同樣要求 `aal2`。兩步驟驗證用 Supabase Auth 的 TOTP（本機 `config.toml` 已開；測試與正式專案在 Dashboard → Authentication → MFA 開啟） |
| `maintenance` | 只有排程 | 需要 Storage API 的清理（孤兒照片、刪除帳號後的照片） |
| `background-jobs` | 只有資料庫排程（`pg_cron` → `pg_net`） | 執行背景任務佇列（M1a-05：食材正規化）。要帶 `BACKGROUND_JOBS_TOKEN`。流程（`functions/background-jobs/runner.ts`，資料庫與 AI 由外面傳入，單元測試用假的）：全站預算用完就不領 → 領 20 個詞 → 程式從字典挑候選（`_shared/ingredient-candidates.ts`：名字或別名包含、二連詞重疊，最多 8 個，已淘汰的不列；沒有候選的詞不問 AI，直接記成沒有合適的）→ 一次呼叫 `normalize_ingredients`（Haiku 5.5，AI 只回「選第幾個候選，0 是沒有合適的」；選的一定在候選裡，超出範圍就丟掉並讓任務重試）→ 回報結果。用量用 `runAi`（同 `ai` 的流程）算在排隊的人身上；那個人超過上限或被暫停就換下一位，都不行就放回佇列 5 分鐘；預算用完或 AI 關閉就放回佇列 10 分鐘；Claude 出錯等失敗退避重試。紀錄只有數量與錯誤代號，不含食材原文 |
| `mcp` | 經 OAuth 授權的外部 AI | M4 |

**Auth「建立使用者前」hook**（`hook_before_user_created`，Postgres 函式 hook，只有 `supabase_auth_admin` 能執行）：
- Google 登入（任何非密碼的登入方式）：email 要有對應的待接受、沒過期、一般邀請（不分大小寫），沒有就回 403 `invite_required`。
- 公開的密碼註冊（`/auth/v1/signup`）一律回 403 `signup_requires_invite`；只有 `app_metadata.invite_signup = true` 的放行（`accept-invite` 建立使用者時帶；使用者自己送的註冊填不了 `app_metadata`）。實測 admin API 建立的使用者本來就不經過這個 hook，所以這個標記只是保險。
- 為什麼要這樣：Google 登入要開 Auth 的「允許新使用者註冊」（關著時連 OAuth 的新使用者也會被擋），開了之後 `/auth/v1/signup` 也跟著開放，所以由 hook 把公開的密碼註冊擋回去。
- hook 只檢查、不改資料。邀請的認領與初始化放在第一次登入後由 `complete_google_signup` 一次做完（同一個交易，整批成功或整批不做）；這樣暱稱、時區、地區可以用手機送來的值，也不用在 Auth 內部的交易裡執行 `setup_new_user`。
- hook 的設定不在 migration 裡：本機看 `supabase/config.toml`；雲端專案在 Dashboard 的 Authentication → Auth Hooks 設定，或用 `supabase config push`，CI 不會推 Auth 設定。步驟見 [spikes/README.md](../spikes/README.md#05-auth-hook-與-google-登入) 與 M1a-01b 的 PR 說明。

## 七、觸發器

| 觸發時機 | 做什麼 |
|---------|-------|
| 每張表新增、修改 | 設定 `created_at`、`updated_at` |
| `photos` 新增 | 檢查擁有者存在；食譜照片（含步驟照）先鎖住那篇食譜，再依 `app_config.photo_limits` 檢查張數（上方 5 張、每步 1 張、每次又做了一次 3 張，各自計算），同時送出也不會超過 |
| `kitchen_members` 新增、修改、刪除 | 每人最多 5 個廚房、每廚房最多 10 人、至少一位管理者；產生廚房相關通知 |
| `reactions`、`comments`、`bookmarks`、`friend_shares`、`friendships` 新增 | 依收件人的通知開關產生通知；要推播的，排一筆 `push` 背景任務 |
| `comments` 新增 | 回覆只能一層 |
| `notifications` 新增 | Realtime 推給收件人，「我的」分頁出現紅點 |
| `pantry_items`、`kitchen_equipment` 變更 | Realtime 推給同廚房的成員 |
| `preference_profiles`（維度或情境）、`bookmarks`（新增、取消收藏、連到食譜）、`ai_suggestion_cache`（回饋）、`pantry_items`（新增、移除、食材或廚房改變；同廚房的成員都標）、`chef_conversations`（偏好訊號）變更 | 把相關使用者的 `taste_profile_snapshots.stale` 設為真（已經是過期就不寫）；實際重算在 `ai` 函式裡做。`recipes` 要等 M1b 發佈後整理寫好標籤才接 |

衍生欄位不靠觸發器，在 `save_recipe` 等函式裡一起計算，比較好測試。

## 八、註冊時建立的資料

| 情況 | 建立的資料 |
|------|-----------|
| 所有人 | `user_profiles`（啟用中）、`user_identities`、`user_settings`（介面語言、預設值）、`preference_profiles`（空的）、`entitlements`（依邀請的方案）、`analytics_identities`、`dietary_profiles`（空的） |
| 一般邀請、或你自己（M0） | 一個自己的廚房（預設名稱與手機的時區、地區，新手引導 ⑥-2 再確認），加上管理者身分；依邀請設定和邀請者成為好友 |
| 廚房邀請 | 新手引導 ⑥ 確認後加入邀請者的廚房（成員身分），不另外建自己的廚房；選了「建立自己的廚房」才建；預設和邀請者成為好友 |

全部在同一個資料庫函式 `setup_new_user` 裡完成，由 `accept-invite` 呼叫。

**M0 的第一個帳號**（正式、測試專案各做一次）：Supabase 後台關閉「Allow new users to sign up」，在 Authentication → Users 建立帳號（勾選自動確認），再到 SQL Editor 執行 `select private.init_first_admin('email');`：跑 `setup_new_user` 並設為系統管理員。這個函式只有資料庫擁有者能執行，不經 API 公開。上表的資料表還沒建的，建表時一併加進這個函式。

## 九、排程

| 排程 | 頻率 | 做什麼 |
|------|------|-------|
| 到期提醒、週末靈感 | 每 15 分鐘（`pg_cron`） | 找出現在是當地提醒時間的廚房、週六早上的使用者，排入推播 |
| 背景任務 | 每分鐘（`pg_cron`） | `private.dispatch_background_jobs`：有到期的任務、而且累積到 20 個或最早的已經等超過 2 分鐘，才用 `pg_net` 叫 `background-jobs`（累積幾個詞一起送，少呼叫幾次 AI）；失敗就退避重試。另每天 19:40（UTC）清掉完成與放棄很久的任務 |
| 每日維護 | 每天凌晨 | 刪除超過 30 天的對話、移除超過 30 天的食材（`private.purge_removed_pantry_items`）、90 天的通知與錯誤紀錄、過期的速率計數；軟刪除到期的資料（食譜、廚房）；13 個月以上的產品事件與 AI 用量明細；AI 費用對帳 |
| 每月匯總 | 每月 1 日 | 產生上個月的 `product_metrics_monthly` |
| 喚醒與孤兒照片檔 | 每週（GitHub Actions，`weekly.yml`） | 喚醒測試與正式專案；呼叫 `maintenance` 清掉資料庫沒有記錄、且超過 24 小時的照片檔（孤兒超過檔案總數一半時不刪，記一筆 critical） |

每次執行的結果寫進 `error_logs`（`source: 'cron'`），後台總覽顯示。

## 十、共用套件的限制

`packages/core`、`ingredients`、`equipment`、`shared-types` 要同時在前端（Vite）與 Edge Functions（Deno）執行：

- 只用標準 ESM 與標準 Web API，不用 Node 專用的模組（`fs`、`path`、`Buffer` 等）。
- 不依賴只在瀏覽器存在的東西（`window`、`localStorage`）。
- 兩邊各跑一次單元測試。

## 十一、建置順序

| 階段 | 先建 |
|------|------|
| M0 | 慣例與擴充套件、字典表與匯入、帳號與廚房相關表、食材、廚具、食譜（含私人表）、照片、口味地圖、`app_config`、`error_logs`；`save_recipe`、`publish_recipe`、`add_pantry_items`、`set_avatar`；權限規則與自動化測試；初始化腳本；喚醒與孤兒照片檔清理 |
| M1a | 邀請與 `accept-invite`、方案、`ai` 函式與用量保護、對話、點子快取、收藏（大廚的點子）、產品數據與 `track`、後台的 `admin`、背景任務 |
| M1b | 食譜版本、口述整理、匯入 |
| M2 | 社群各表與函式、家人檔案、分享連結與 `share`、通知與推播、`feed_page` |
| 之後 | 依各階段功能補上 |
