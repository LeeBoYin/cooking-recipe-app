import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@zhusha/shared-types';

let client: SupabaseClient<Database> | undefined;

// 第一次用到時才建立，沒有設定環境變數時給出清楚的錯誤。
export function supabase(): SupabaseClient<Database> {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_PUBLISHABLE_KEY，請參考 apps/web/.env.example');
  }
  client = createClient<Database>(url, key);
  return client;
}
