// 背景任務：發佈後整理（M1b-04b）。一次領一批 post_publish 任務 → 讀那一篇 → 補標籤，需要時一起估難易度 → 寫回食譜。
// 純邏輯：資料庫呼叫與 AI 都由外面傳進來，方便用假的回應測試。紀錄只有數量與錯誤代號，不含食譜內容。
//   • 難易度：作者動過的（author）不估；已經有 AI 估的、這次是第一次發佈（publish）也不重估（用說的整理時已經估過）；
//     做法改了（edit）才重估 AI 估的；沒有難易度、又有文字可以看時才估。
//   • 預算用完、AI 關閉：暫停，任務放回佇列（不算一次嘗試）。這個人超過上限或被暫停：晚點再試。
import type { AiErrorCode, AiResult } from '../ai/pipeline.ts';
import { checkPostPublish, type PostPublishResult } from '../ai/post-publish/check.ts';
import type { PostPublishInput, RawPostPublish } from '../ai/post-publish/prompt.ts';
import { call, NO_RETRY, PAUSE_ALL, type Rpc, USER_BLOCKED } from './runner.ts';

export const POST_PUBLISH_BATCH = 10;

export interface PostPublishContext {
  recipe_id: string;
  user_id: string;
  mode: 'publish' | 'edit' | null;
  lang: string;
  title: string | null;
  story: string | null;
  tips: string | null;
  ingredients: { text: string | null; ingredient_id: string | null }[];
  steps: string[];
  difficulty_source: 'author' | 'ai' | null;
  tags_confirmed: boolean;
  updated_at: string;
}

export interface PostPublishDeps {
  rpc: Rpc;
  // 以食譜作者的名義呼叫 post_publish（用量與預算照 M1a-04 計入作者）
  ask(userId: string, input: PostPublishInput): Promise<AiResult>;
}

export interface PostPublishSummary {
  claimed: number;
  done: number;
  skipped: number; // 食譜已經不在或不是已發佈
  failed: number;
  released: number;
  paused: 'budget' | 'ai_disabled' | null;
}

// 要不要估難易度（純函式，測試用）
export function wantsDifficulty(ctx: Pick<PostPublishContext, 'difficulty_source' | 'mode' | 'story' | 'steps' | 'ingredients'>): boolean {
  if (ctx.difficulty_source === 'author') return false;
  const hasText = ctx.steps.length > 0 || ctx.ingredients.length > 0 || (ctx.story ?? '').trim() !== '';
  if (!hasText) return false; // 只有照片、沒有任何文字時不估
  if (ctx.difficulty_source === null) return true;
  return ctx.mode === 'edit'; // source = ai：做法改了才重估
}

export async function runPostPublish(deps: PostPublishDeps): Promise<PostPublishSummary> {
  const summary: PostPublishSummary = { claimed: 0, done: 0, skipped: 0, failed: 0, released: 0, paused: null };
  if ((await call<string>(deps.rpc, 'ai_budget_state', {})) === 'exhausted') {
    summary.paused = 'budget';
    return summary;
  }
  const jobs = await call<{ id: string }[]>(deps.rpc, 'claim_background_jobs', { p_kind: 'post_publish', p_limit: POST_PUBLISH_BATCH });
  summary.claimed = jobs.length;

  const release = async (ids: string[], delaySeconds: number) => {
    if (ids.length === 0) return;
    await call(deps.rpc, 'release_background_jobs', { p_ids: ids, p_delay_seconds: delaySeconds });
    summary.released += ids.length;
  };
  const fail = async (id: string, code: string, retry: boolean) => {
    await call(deps.rpc, 'fail_background_job', { p_id: id, p_code: code, p_retry: retry });
    summary.failed += 1;
  };

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;
    try {
      const ctx = await call<PostPublishContext | null>(deps.rpc, 'post_publish_context', { p_job: job.id });
      if (!ctx) {
        // 食譜已經刪了或不是已發佈：沒有東西可整理，任務結束
        await call(deps.rpc, 'complete_post_publish', { p_job: job.id, p_tags: null, p_difficulty: null, p_read_at: new Date().toISOString() });
        summary.skipped += 1;
        continue;
      }
      const withDifficulty = wantsDifficulty(ctx);
      const input: PostPublishInput = {
        title: ctx.title ?? '',
        story: ctx.story ?? '',
        tips: ctx.tips ?? '',
        ingredients: ctx.ingredients.flatMap((x) => (x.text ? [x.text] : [])),
        steps: ctx.steps,
        withDifficulty,
      };
      const r = await deps.ask(ctx.user_id, input);
      if (!r.ok) {
        const code: AiErrorCode = r.error;
        if (PAUSE_ALL.includes(code)) {
          summary.paused = code === 'budget_exhausted' ? 'budget' : 'ai_disabled';
          await release(jobs.slice(i).map((j) => j.id), 600); // 這一個與後面的都放回去，不算一次嘗試
          return summary;
        }
        if (USER_BLOCKED.includes(code)) {
          await release([job.id], 300);
          continue;
        }
        await fail(job.id, code, !NO_RETRY.includes(code));
        continue;
      }
      const result: PostPublishResult = checkPostPublish(r.output as RawPostPublish, { withDifficulty, hasSteps: ctx.steps.length > 0 });
      if (withDifficulty && !result.difficulty) {
        await fail(job.id, 'invalid_output', true);
        continue;
      }
      await call(deps.rpc, 'complete_post_publish', { p_job: job.id, p_tags: result.tags, p_difficulty: result.difficulty, p_read_at: ctx.updated_at });
      summary.done += 1;
    } catch {
      // 這一個出錯（資料庫呼叫失敗等）：留給逾時機制（10 分鐘後可再領），繼續處理下一個
      console.error('background-jobs: post_publish job failed');
      summary.failed += 1;
    }
  }
  return summary;
}
