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
  // 背景任務：使用者的操作觸發、不是使用者在連點，所以不算速率限制；預算用完時暫停排隊
  background?: boolean;
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
  post_publish: { model: 'claude-haiku-5-5', effort: 'low', thinking: 'off', maxOutputTokens: 600, background: true },
  normalize_ingredient: { model: 'claude-haiku-5-5', effort: 'low', thinking: 'off', maxOutputTokens: 300, background: true },
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

// 模型價格：每百萬 token 的美元（03〈模型選擇〉）。改價格改這裡，不用動計算的程式。
// cacheWrite 是 5 分鐘快取的寫入價（輸入價的 1.25 倍）。
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const MODEL_PRICES: Record<ModelId, ModelPrice> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

// 回應裡的模型名稱可能帶日期尾巴（例：claude-haiku-5-5-20260101），依前綴對應；
// 認不得的模型一律照最貴的算（寧可多算，不讓預算保護失靈）。
export function priceOf(model: string): ModelPrice {
  const hit = (Object.keys(MODEL_PRICES) as ModelId[]).find((id) => model === id || model.startsWith(`${id}-`));
  return hit ? MODEL_PRICES[hit] : MODEL_PRICES['claude-opus-5-5'];
}

// 費用（美元），四捨五入到小數 8 位（資料庫欄位也是 8 位，小額呼叫不會被捨成 0）
export function costUsd(model: string, usage: TokenUsage): number {
  const p = priceOf(model);
  const total =
    (usage.inputTokens * p.input + usage.outputTokens * p.output + usage.cacheReadTokens * p.cacheRead + usage.cacheWriteTokens * p.cacheWrite) /
    1_000_000;
  return Math.round(total * 1e8) / 1e8;
}

// 全站預算用到提醒門檻（預設 80%）時的降級（03〈換模型的規則〉）。對話不降級。
// config：覆寫這個任務的設定；rules：這個任務改用規則或模板，不呼叫 AI。
// 降級寫在這裡，由 ai 函式統一套用，不在各任務裡寫死。
export const BUDGET_DEGRADE: Partial<Record<TaskName, { config: Partial<TaskConfig> } | { rules: true }>> = {
  home_ideas: { config: { model: 'claude-haiku-5-5', thinking: 'off' } },
  inspiration_egg: { rules: true },
};

export function degradeConfig(task: TaskName, config: TaskConfig): TaskConfig | 'use_rules' {
  const rule = BUDGET_DEGRADE[task];
  if (!rule) return config;
  if ('rules' in rule) return 'use_rules';
  return { ...config, ...rule.config };
}
