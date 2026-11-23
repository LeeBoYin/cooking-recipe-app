// background-jobs（16 第三、九節）：執行背景任務佇列：食材正規化（M1a-05）、發佈後整理（M1b-04b）。
// 只有資料庫排程（pg_cron + pg_net，每分鐘看有沒有該處理的）呼叫：要帶 BACKGROUND_JOBS_TOKEN，不開放給使用者。
// 用量（費用、預算）照 M1a-04 的方式記在排隊的那位使用者身上；背景任務不算速率，預算用完就暫停。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createClaude } from '../ai/claude.ts';
import { type AiContext, type Deps, runAi } from '../ai/pipeline.ts';
import { TASKS } from '../ai/tasks.ts';
import { createProtection } from '../ai/usage.ts';
import type { DictRow } from '../_shared/ingredient-candidates.ts';
import { safeEqual } from '../_shared/safe-equal.ts';
import { runNormalization } from './runner.ts';
import { runPostPublish } from './post-publish.ts';
import { postPublishTask } from '../ai/post-publish/prompt.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

Deno.serve(async (req) => {
  const token = Deno.env.get('BACKGROUND_JOBS_TOKEN')?.trim();
  if (!token) return json({ error: 'not_configured' }, 500);
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '').trim();
  if (!safeEqual(given, token)) return json({ error: 'unauthorized' }, 401);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!url || !serviceKey || !apiKey) return json({ error: 'not_configured' }, 500);
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  const rpc = async (fn: string, args: Record<string, unknown>) => await client.rpc(fn, args);

  const aiDeps: Deps = {
    async getContext(userId) {
      const { data, error } = await client.rpc('ai_get_context', { p_user: userId });
      if (error) throw new Error('context');
      return (data as AiContext | null) ?? null;
    },
    claude: createClaude(apiKey),
    tasks: TASKS,
    allowInternalTasks: false,
    ...createProtection(rpc, null),
  };

  try {
    const summary = await runNormalization({
      rpc,
      async loadDict() {
        const { data, error } = await client.from('dict_ingredients').select('id, name, aliases, deprecated');
        if (error) throw new Error('dict');
        return data as unknown as DictRow[];
      },
      ask: (userId, input) => runAi(aiDeps, userId, 'normalize_ingredients', input),
    });
    // 發佈後整理：標籤與難易度。任務定義依這一篇的內容臨時組，不登記在 TASKS（使用者不能直接呼叫）
    const postPublish = await runPostPublish({
      rpc,
      ask: (userId, input) => runAi({ ...aiDeps, tasks: { post_publish: postPublishTask(input) as never } }, userId, 'post_publish', {}),
    });
    // 只回數量
    return json({ normalization: summary, post_publish: postPublish });
  } catch {
    console.error('background-jobs: server_error');
    return json({ error: 'server_error' }, 500);
  }
});
