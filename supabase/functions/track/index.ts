// track（16 第六節、14 第三節）：收手機送來的產品事件。
// 流程：驗證 JWT → 檢查整批與每個事件（只收白名單，不合格的丟掉）→ track_events 查分析 ID、
// 「不參與使用統計」開著就整批不記、其餘寫入。事件只有操作，不含內容；紀錄也不含事件的內容。
// 手機的錯誤紀錄仍走 log_error，不經這裡。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleTrack } from './handle.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'not_configured' }, 500);
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '').trim();
  if (!token) return json({ error: 'unauthorized' }, 401);
  const { data: auth, error: authError } = await client.auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'unauthorized' }, 401);

  const result = await handleTrack(
    {
      now: () => Date.now(),
      async write(batch, dropped) {
        const { error } = await client.rpc('track_events', {
          p_user_id: auth.user.id,
          p_app_version: batch.appVersion,
          p_platform: batch.platform,
          p_installed: batch.installed,
          p_events: batch.events,
          p_dropped: dropped,
        });
        if (error) {
          console.error('track: track_events failed', error.code);
          throw new Error('write');
        }
      },
    },
    await req.text(),
  );
  if (result.status === 204) return new Response(null, { status: 204, headers: CORS });
  return json({ error: result.error }, result.status);
});
