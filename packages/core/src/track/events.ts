// 產品事件的白名單（14 第三節）：事件名稱、每個事件允許的屬性與值，只寫在這一份。
// 前端用型別擋下送錯的事件，`track` 函式用 `validateEvent` 在執行期再檢查一次。
// 屬性只能是列舉、整數或布林，不能是自由文字——不記任何內容。
// 新增事件或屬性時，要同時更新 14 的事件清單，和資料庫的 `private.product_event_names()`（有測試比對）。

// 畫面清單：`screen` 只能是這些代碼，由路由表對應（apps/web 的 trackScreen）
export const TRACK_SCREENS = [
  'home',
  'chat',
  'recipes',
  'recipes_saved',
  'recipes_drafts',
  'saved_idea',
  'record',
  'record_import',
  'recipe',
  'recipe_edit',
  'kitchen',
  'kitchen_equipment',
  'kitchen_settings',
  'pantry_add',
  'pantry_inventory',
  'pantry_edit',
  'equipment_add',
  'equipment_inventory',
  'equipment_edit',
  'me',
  'me_taste',
  'me_diet',
  'me_trash',
  'taste',
  'onboarding',
  'other',
] as const;
export type TrackScreen = (typeof TRACK_SCREENS)[number];

export const TRACK_PLATFORMS = ['ios', 'android', 'desktop'] as const;
export type TrackPlatform = (typeof TRACK_PLATFORMS)[number];

type EnumProp = { readonly kind: 'enum'; readonly values: readonly string[] };
type IntProp = { readonly kind: 'int'; readonly max: number };
type BoolProp = { readonly kind: 'bool' };
type PropSpec = EnumProp | IntProp | BoolProp;

const e = <const V extends readonly string[]>(values: V) => ({ kind: 'enum', values }) as const;
const n = (max: number) => ({ kind: 'int', max }) as const;
const b = { kind: 'bool' } as const;

const SOURCES = ['home', 'chat'] as const;
const SLOTS = ['familiar', 'twist', 'adventure'] as const;

// 每個事件的屬性：宣告的屬性一律必填、不能多給
export const TRACK_EVENTS = {
  'app.open': {},
  'screen.view': {},
  'record.start': { entry: e(['plus', 'bookmark']) },
  'record.publish': { photoCount: n(30), hasSteps: b, visibility: e(['private', 'household', 'friends']), highlightCount: n(20) },
  // 放棄時做到哪：空白、有照片、有文字（標題或故事）、有食材或做法
  'record.abandon': { step: e(['blank', 'photo', 'text', 'method']) },
  'record.draft_saved': {},
  'record.draft_published': {},
  // 還原食譜版本：只記操作，不記是哪一版、哪一篇
  'recipe.revision_restored': {},
  // 從網址或貼上的文字匯入：只記輸入方式與結果（程式直接讀、AI 擷取、失敗），不記網址與內容
  'import.finished': { input: e(['url', 'text']), result: e(['structured', 'ai', 'failed']) },
  'chat.start': {},
  'chat.message_sent': { turn: n(100) },
  'suggestion.shown': { source: e(SOURCES), slot: e(SLOTS) },
  'suggestion.opened': { source: e(SOURCES), slot: e(SLOTS) },
  'suggestion.bookmarked': { source: e(SOURCES), slot: e(SLOTS) },
  // 收藏沒存槽位與來源，所以「做了並記錄」不帶屬性
  'suggestion.recorded': {},
  'onboarding.step': {
    step: e(['vision', 'install', 'diet', 'taste', 'kitchen', 'stock', 'done']),
    action: e(['start', 'complete', 'skip']),
  },
  'taste.answered': { questionType: e(['dish_card', 'this_or_that', 'spectrum', 'quick_fire', 'constraint', 'context']) },
  'settings.changed': {
    key: e(['units', 'chef_persona', 'servings', 'dietary', 'taste_map']),
  },
  'error': { kind: e(['photo_upload', 'ai_blocked', 'permission', 'network']) },
} as const satisfies Record<string, Record<string, PropSpec>>;

export type TrackEventName = keyof typeof TRACK_EVENTS;
export const TRACK_EVENT_NAMES = Object.keys(TRACK_EVENTS) as TrackEventName[];

type PropValue<P> = P extends { kind: 'enum'; values: readonly (infer V)[] }
  ? V
  : P extends { kind: 'int' }
    ? number
    : P extends { kind: 'bool' }
      ? boolean
      : never;

export type TrackProps<N extends TrackEventName> = { [K in keyof (typeof TRACK_EVENTS)[N]]: PropValue<(typeof TRACK_EVENTS)[N][K]> };

// 一個事件在線上的樣子（手機 → `track` 函式）
export interface TrackWireEvent {
  name: string;
  sessionId: string;
  screen?: string;
  props?: Record<string, string | number | boolean>;
  at: string; // ISO 8601
}

export interface TrackBatch {
  appVersion: string;
  platform: TrackPlatform;
  installed: boolean;
  events: TrackWireEvent[];
}

export const TRACK_MAX_BATCH = 50;
export const TRACK_MAX_APP_VERSION_LENGTH = 32;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTrackEventName(name: unknown): name is TrackEventName {
  return typeof name === 'string' && Object.hasOwn(TRACK_EVENTS, name);
}

function propOk(spec: PropSpec, value: unknown): boolean {
  switch (spec.kind) {
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value);
    case 'int':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= spec.max;
    case 'bool':
      return typeof value === 'boolean';
  }
}

// 通過回傳整理好的事件（只留白名單的欄位），不合格回傳 null。`now` 用來擋掉時間亂填的事件
export function validateEvent(raw: unknown, now: number): TrackWireEvent | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const ev = raw as Record<string, unknown>;
  if (!isTrackEventName(ev.name)) return null;
  if (typeof ev.sessionId !== 'string' || !UUID.test(ev.sessionId)) return null;
  if (ev.screen !== undefined && !(typeof ev.screen === 'string' && (TRACK_SCREENS as readonly string[]).includes(ev.screen))) return null;
  if (typeof ev.at !== 'string') return null;
  const at = Date.parse(ev.at);
  // 不收未來超過 5 分鐘、或超過 24 小時前的事件（手機時間不準，或不是正常送出的）
  if (Number.isNaN(at) || at > now + 5 * 60_000 || at < now - 24 * 3_600_000) return null;

  const spec: Record<string, PropSpec> = TRACK_EVENTS[ev.name];
  const props = ev.props === undefined ? {} : ev.props;
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return null;
  const given = props as Record<string, unknown>;
  const keys = Object.keys(given);
  const declared = Object.keys(spec);
  if (keys.length !== declared.length) return null;
  for (const key of declared) {
    const s = spec[key];
    if (!s || !Object.hasOwn(given, key) || !propOk(s, given[key])) return null;
  }
  const out: TrackWireEvent = { name: ev.name, sessionId: ev.sessionId, at: new Date(at).toISOString() };
  if (ev.screen !== undefined) out.screen = ev.screen as string;
  if (declared.length > 0) out.props = Object.fromEntries(declared.map((k) => [k, given[k] as string | number | boolean]));
  return out;
}

// 整批：回傳通過的事件與被丟掉的數量（超過一批上限的也算丟掉）。整批的欄位不合格回傳 null
export function validateBatch(raw: unknown, now: number): { batch: TrackBatch; dropped: number } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.appVersion !== 'string' || body.appVersion.length === 0 || body.appVersion.length > TRACK_MAX_APP_VERSION_LENGTH) return null;
  if (typeof body.platform !== 'string' || !(TRACK_PLATFORMS as readonly string[]).includes(body.platform)) return null;
  if (typeof body.installed !== 'boolean') return null;
  if (!Array.isArray(body.events)) return null;
  const events: TrackWireEvent[] = [];
  let dropped = Math.max(0, body.events.length - TRACK_MAX_BATCH);
  for (const raw of body.events.slice(0, TRACK_MAX_BATCH)) {
    const ev = validateEvent(raw, now);
    if (ev) events.push(ev);
    else dropped += 1;
  }
  return { batch: { appVersion: body.appVersion, platform: body.platform as TrackPlatform, installed: body.installed, events }, dropped };
}
