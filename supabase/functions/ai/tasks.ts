// 任務登記：任務名稱 → 輸入檢查、prompt、輸出 schema。模型與 effort 不在這裡，在 _shared/ai-models.ts。
// 真正的任務（點子 M1a-06、對話 M1a-07…）之後各自加在這裡；現在只有內部測試用的 _selftest。
import type { TaskName } from '../_shared/ai-models.ts';
import type { TaskDefinition } from './pipeline.ts';

const SELFTEST_MAX_CHARS = 200;

const selftest: TaskDefinition<{ text: string }> = {
  parseInput(raw) {
    if (typeof raw !== 'object' || raw === null) return { ok: false };
    const text = (raw as { text?: unknown }).text;
    if (typeof text !== 'string' || text.length === 0 || [...text].length > SELFTEST_MAX_CHARS) return { ok: false };
    return { ok: true, value: { text } };
  },
  buildPrompt(input) {
    return {
      stable: '你是連線測試用的小幫手。使用者給一段短文字，你只回傳 JSON：reply 是把原文原樣回傳，length 是原文的字數。',
      messages: [{ role: 'user', content: input.text }],
    };
  },
  outputSchema: {
    type: 'object',
    properties: { reply: { type: 'string' }, length: { type: 'integer' } },
    required: ['reply', 'length'],
    additionalProperties: false,
  },
};

export const TASKS: Partial<Record<TaskName, TaskDefinition<never>>> = {
  _selftest: selftest as TaskDefinition<never>,
};
