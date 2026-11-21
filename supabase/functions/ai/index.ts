// ai（16 第六節、03）：所有 AI 任務的唯一入口。前端不直接呼叫 Claude。
// 請求 { task, input }；回應 { data } 或 { error: <代號> }（代號見 pipeline.ts，前端依此走退路）。
// 不開閘道的 JWT 驗證，自己用 Auth 驗證 token。紀錄不含使用者輸入與 AI 的回應。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createClaude } from './claude.ts';
import { type AiContext, type AiErrorCode, type Deps, ERROR_STATUS, runAi } from './pipeline.ts';
import { TASKS } from './tasks.ts';
import { runHomeIdeas } from './home/handler.ts';
import { runChat } from './chat/handler.ts';
import { createProtection, sessionIdOf } from './usage.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}
const error = (code: AiErrorCode) => json({ error: code }, ERROR_STATUS[code]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!url || !serviceKey || !apiKey) return error('not_configured');
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 已登入：token 交給 Auth 驗證（簽章、有沒有過期、帳號有沒有被封鎖）
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '').trim();
  if (!token) return error('unauthorized');
  const { data: auth, error: authError } = await client.auth.getUser(token);
  if (authError || !auth.user) return error('unauthorized');

  let body: { task?: unknown; input?: unknown };
  try {
    body = await req.json();
  } catch {
    return error('invalid_input');
  }
  if (typeof body !== 'object' || body === null) return error('invalid_input');

  const deps: Deps = {
    async getContext(userId) {
      const { data, error: dbError } = await client.rpc('ai_get_context', { p_user: userId });
      if (dbError) {
        console.error('ai: ai_get_context failed', dbError.code);
        throw new Error('context');
      }
      return (data as AiContext | null) ?? null;
    },
    claude: createClaude(apiKey),
    tasks: TASKS,
    // 只有本機與測試專案設 AI_ALLOW_INTERNAL_TASKS=true；正式專案不設
    allowInternalTasks: Deno.env.get('AI_ALLOW_INTERNAL_TASKS') === 'true',
    ...createProtection(async (fn, args) => await client.rpc(fn, args), sessionIdOf(token)),
  };

  try {
    // 首頁點子：自己讀資料、算候選、存快取，再走 runAi 的用量保護與呼叫（見 home/handler.ts）
    if (body.task === 'home_ideas') {
      const home = await runHomeIdeas({ ai: deps, rpc: async (fn, args) => await client.rpc(fn, args) }, auth.user.id, body.input);
      if (!home.ok) {
        console.error('ai: rejected', home.error);
        return error(home.error);
      }
      return json({ data: home.data });
    }
    // 和大廚聊聊：自己讀資料、組候選與提示詞、再檢查、存對話（見 chat/handler.ts）
    if (body.task === 'chat') {
      const chat = await runChat({ ai: deps, rpc: async (fn, args) => await client.rpc(fn, args) }, auth.user.id, body.input);
      if (!chat.ok) {
        console.error('ai: rejected', chat.error);
        return error(chat.error);
      }
      return json({ data: chat.data });
    }
    const result = await runAi(deps, auth.user.id, body.task, body.input);
    if (!result.ok) {
      console.error('ai: rejected', result.error);
      return error(result.error);
    }
    return json({ data: result.output });
  } catch {
    console.error('ai: server_error');
    return error('server_error');
  }
});
