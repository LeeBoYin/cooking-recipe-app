// 每個 AI 任務的模型、effort、輸出上限（03〈模型選擇〉）。改這個檔就能換模型，不用動任務的程式。
// `ai` 函式依這裡組請求；`admin` 函式把它唯讀地顯示在後台的系統設定。
// 只用標準 TypeScript，Deno 2.1 相容。

export type ModelId = 'claude-sonnet-5-5' | 'claude-haiku-5-5' | 'claude-opus-5-5';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface TaskConfig {
  model: ModelId;
  effort: Effort;
  // 'off'：關閉思考（只有 Haiku 5.5 能關；Sonnet 5.5 與 Opus 5.5 關不掉，只能用 effort 控制）
  thinking: 'adaptive' | 'off';
  // max_tokens：輸出（含思考）的上限
  maxOutputTokens: number;
  // 內部測試用的任務：正式環境不能呼叫（見 AI_ALLOW_INTERNAL_TASKS）
  internal?: boolean;
}

// 任務名稱就是 `ai` 函式的白名單；沒列在這裡的任務一律拒絕。
// 已列出但還沒有實作的任務（後面的 M1a 各段才做），呼叫時回 task_not_available。
export const AI_TASKS = {
  chat: { model: 'claude-sonnet-5-5', effort: 'medium', thinking: 'adaptive', maxOutputTokens: 2000 },
  home_ideas: { model: 'claude-sonnet-5-5', effort: 'low', thinking: 'adaptive', maxOutputTokens: 2000 },
  expand_steps: { model: 'claude-sonnet-5-5', effort: 'low', thinking: 'adaptive', maxOutputTokens: 2000 },
  dictation: { model: 'claude-sonnet-5-5', effort: 'low', thinking: 'adaptive', maxOutputTokens: 2000 },
  import_url: { model: 'claude-haiku-5-5', effort: 'low', thinking: 'off', maxOutputTokens: 2000 },
  edit_by_voice: { model: 'claude-haiku-5-5', effort: 'low', thinking: 'off', maxOutputTokens: 1000 },
  post_publish: { model: 'claude-haiku-5-5', effort: 'low', thinking: 'off', maxOutputTokens: 600 },
  normalize_ingredient: { model: 'claude-haiku-5-5', effort: 'low', thinking: 'off', maxOutputTokens: 300 },
  inspiration_egg: { model: 'claude-haiku-5-5', effort: 'low', thinking: 'off', maxOutputTokens: 300 },
  // 驗證整條路徑用，不做任何真正的事
  _selftest: { model: 'claude-haiku-5-5', effort: 'low', thinking: 'off', maxOutputTokens: 200, internal: true },
} as const satisfies Record<string, TaskConfig>;

export type TaskName = keyof typeof AI_TASKS;

export function isTaskName(name: unknown): name is TaskName {
  return typeof name === 'string' && Object.hasOwn(AI_TASKS, name);
}

// 後台顯示用：不含內部測試任務
export function publicTaskList(): { task: string; model: ModelId; effort: Effort; thinking: 'adaptive' | 'off'; max_output_tokens: number }[] {
  return (Object.entries(AI_TASKS) as [string, TaskConfig][])
    .filter(([, c]) => !c.internal)
    .map(([task, c]) => ({ task, model: c.model, effort: c.effort, thinking: c.thinking, max_output_tokens: c.maxOutputTokens }));
}
