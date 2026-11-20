// maintenance：需要 Storage API 的維護工作（16 第六節）。目前只有掃孤兒照片檔。
// 只有排程（GitHub Actions 每週）呼叫：要帶 MAINTENANCE_TOKEN，不開放給一般使用者。
// 回傳數字給呼叫端寫進錯誤紀錄，不回傳檔名。
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { chunk, planOrphanRemoval, safeEqual, type StoredFile } from './orphans.ts';

const BUCKET = 'photos';
const PAGE = 1000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// 逐層列出 bucket 裡所有檔案（資料夾的 id 是 null）
async function listAll(client: SupabaseClient, prefix = ''): Promise<StoredFile[]> {
  const files: StoredFile[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.storage.from(BUCKET).list(prefix, { limit: PAGE, offset });
    if (error) throw error;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...(await listAll(client, path)));
      else files.push({ path, createdAt: new Date(item.created_at ?? Date.now()) });
    }
    if (data.length < PAGE) break;
  }
  return files;
}

async function referencedPaths(client: SupabaseClient): Promise<Set<string>> {
  const paths = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('photos')
      .select('storage_path, feed_path, thumb_path')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data) {
      paths.add(row.storage_path);
      paths.add(row.feed_path);
      paths.add(row.thumb_path);
    }
    if (data.length < PAGE) break;
  }
  return paths;
}

Deno.serve(async (req) => {
  // 設定時容易多貼到頭尾的空白或換行，兩邊都先去掉
  const token = Deno.env.get('MAINTENANCE_TOKEN')?.trim();
  if (!token) return json({ error: 'not_configured' }, 500);
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '').trim();
  if (!safeEqual(given, token)) return json({ error: 'unauthorized' }, 401);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'not_configured' }, 500);
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    const [files, referenced] = await Promise.all([listAll(client), referencedPaths(client)]);
    const plan = planOrphanRemoval(files, referenced, new Date());
    let removed = 0;
    if (!plan.refusedReason) {
      for (const batch of chunk(plan.orphans, 100)) {
        const { error } = await client.storage.from(BUCKET).remove(batch);
        if (error) throw error;
        removed += batch.length;
      }
    }
    return json({ total: plan.total, orphans: plan.orphans.length, removed, refused: plan.refusedReason ?? null });
  } catch (_err) {
    // 不把錯誤內容送回去，呼叫端只需要知道失敗
    return json({ error: 'failed' }, 500);
  }
});
