-- maintenance Edge Function（用 service_role 連線）要讀 photos 的檔案路徑，才知道哪些 Storage 檔案是孤兒。
-- 資料表預設不開放給任何 API 角色，所以這裡明確給 service_role 讀取（只讀，不寫）。
grant select on public.photos to service_role;
