// ai（16 第六節、03）：所有 AI 任務的唯一入口。前端不直接呼叫 Claude。
// 請求 { task, input }；回應 { data } 或 { error: <代號> }（代號見 pipeline.ts，前端依此走退路）。
// 不開閘道的 JWT 驗證，自己用 Auth 驗證 token。紀錄不含使用者輸入與 AI 的回應。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createClaude } from './claude.ts';
import { type AiContext, type AiErrorCode, type Deps, ERROR_STATUS, runAi } from './pipeline.ts';
import { TASKS } from './tasks.ts';
import { runHomeIdeas } from './home/handler.ts';
import { runChat } from './chat/handler.ts';
import { runExpandSteps } from './expand/handler.ts';
import { runImportUrl } from './import/handler.ts';
import { runDictation } from './dictation/handler.ts';
import { runRefine } from './refine/handler.ts';
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

// DNS 解析：IPv4 與 IPv6 都查，兩種都沒有就丟出錯誤（視為不能連）
async function resolveHost(hostname: string): Promise<string[]> {
  const [a, aaaa] = await Promise.allSettled([Deno.resolveDns(hostname, 'A'), Deno.resolveDns(hostname, 'AAAA')]);
  return [...(a.status === 'fulfilled' ? a.value : []), ...(aaaa.status === 'fulfilled' ? aaaa.value : [])];
}

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
    // 點子抽屜的做法：自己讀點子、已經展開過就用存下來的、再檢查、存進快取與收藏（見 expand/handler.ts）
    if (body.task === 'expand_steps') {
      const expand = await runExpandSteps({ ai: deps, rpc: async (fn, args) => await client.rpc(fn, args) }, auth.user.id, body.input);
      if (!expand.ok) {
        console.error('ai: rejected', expand.error);
        return error(expand.error);
      }
      return json({ data: expand.data });
    }
    // 從網址匯入：後端抓網頁、有結構化食譜資料由程式讀，沒有才叫 Claude（見 import/handler.ts）
    if (body.task === 'import_url') {
      const imported = await runImportUrl(
        { ai: deps, net: { fetch: async (u, init) => await fetch(u, init), resolve: resolveHost } },
        auth.user.id,
        body.input,
      );
      if (!imported.ok) {
        console.error('ai: rejected', imported.error);
        return error(imported.error);
      }
      return json({ data: imported.data });
    }
    // 用說的：把口述整理進編輯頁的欄位，保留作者已經填的內容、只補新的（見 dictation/handler.ts）
    if (body.task === 'dictation') {
      const dictated = await runDictation({ ai: deps, rpc: async (fn, args) => await client.rpc(fn, args) }, auth.user.id, body.input);
      if (!dictated.ok) {
        console.error('ai: rejected', dictated.error);
        return error(dictated.error);
      }
      return json({ data: dictated.data });
    }
    // 用說的改食譜：只回要改的欄位與新值，手機列出「會改這些」讓作者確認（見 refine/handler.ts）
    if (body.task === 'edit_by_voice') {
      const refined = await runRefine({ ai: deps, rpc: async (fn, args) => await client.rpc(fn, args) }, auth.user.id, body.input);
      if (!refined.ok) {
        console.error('ai: rejected', refined.error);
        return error(refined.error);
      }
      return json({ data: refined.data });
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
