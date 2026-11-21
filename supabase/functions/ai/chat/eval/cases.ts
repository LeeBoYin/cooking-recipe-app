// 和大廚聊聊的評估集：6 段劇本式對話（M1a-07）。同一份資料有兩種用途：
// 1. 自動測試（chat.test.ts）：每一輪用事先寫好的「假的 AI 回應」，測整條流程（提示詞、檢查、存對話的規則），進 CI。
// 2. 手動實跑（run.ts）：真的呼叫 Claude（Sonnet 5.5），看回應合不合理、口吻對不對；不進 CI（要花錢，也需要人打分）。
// 使用者的話是固定劇本；實跑時大廚的回應不同，所以 assert 只檢查「不管 AI 怎麼回都該成立」的事。
import type { RawIdea } from '../../home/types.ts';
import { ctx, eq, FREQ, likes, pantry, NOW } from '../../home/eval/cases.ts';
import type { HomeContextRow } from '../../home/types.ts';
import type { ChatEnv } from '../env.ts';
import type { ChatConversationRow, RawChatOutput } from '../types.ts';
import { emptyConversation, type Simulation } from './simulate.ts';

export { NOW };

const DIFF = { ingredients: 2, equipment: 1, time: 2, technique: 2, failure_risk: 1 };
export function idea(ce: ChatEnv, over: Partial<RawIdea> = {}): RawIdea {
  return {
    slot: 'twist', candidate_ref: '', title: '測試小炒', why: '手邊的食材剛好，今天輕鬆煮。',
    uses_pantry_ids: [], uses_priority_ids: [], other_ingredients: [], difficulty: DIFF,
    techniques: ce.env.techniqueEnum.slice(0, 1), equipment: ce.env.equipmentEnum.slice(0, 1), substitutions: [], ...over,
  };
}
const out = (over: Partial<RawChatOutput> = {}): RawChatOutput => ({
  reply: '好啊，來看看。', ask: null, suggestions: [], mentioned_ingredients: [], preference_signals: [], summary: '', ...over,
});

export interface ChatEvalCase {
  id: string;
  name: string;
  ctx: HomeContextRow;
  start?: ChatConversationRow;
  users: string[];
  // 假的 AI 回應（自動測試用）：每一輪一個
  fake: ((ce: ChatEnv) => RawChatOutput)[];
  // 說給人看的期待（人工打分時對照）
  expectation: string;
  // 自動判斷（程式能判斷的部分）：回傳沒過的項目；空陣列是全過。真的 Claude 與假回應都要成立
  assert(sim: Simulation): string[];
}

const TW = ctx({
  taste: { dims: likes('cuisine.taiwan', 'cuisine.taiwan.home', 'form.stir_fry', 'protein.egg'), context: FREQ },
  pantry: pantry('cabbage', 'egg', 'tofu', 'pork-ribs', 'ginger', 'soy-sauce', 'salt'),
  equipment: eq('gas-stove', 'wok', 'pot'),
});
const ALLERGY = ctx({
  taste: { dims: likes('cuisine.southeast_asia', 'cuisine.southeast_asia.thai', 'taste.spicy'), context: FREQ },
  dietary: { allergen_ids: ['shrimp', 'peanut'], restriction_ids: [], dislike_ingredient_ids: [], no_cooking_alcohol: false },
  pantry: pantry('shrimp', 'chicken-thigh', 'thai-basil', 'fish-sauce', 'chili-pepper', 'garlic', 'rice'),
  equipment: eq('gas-stove', 'wok'),
});

const textOf = (r: { reply: string; ask: string | null; ideas: { title: string; why: string }[] }) => [r.reply, r.ask ?? '', ...r.ideas.map((i) => `${i.title} ${i.why}`)].join(' ');
// 每一輪通過檢查的內容
const kept = (sim: Simulation) => sim.turns.flatMap((t) => (t.checked && t.checked.ok ? [{ user: t.user, ...t.checked }] : []));

// 50 句交替的對話（給「20 輪附近」用）
const history = (rounds: number): ChatConversationRow['messages'] =>
  Array.from({ length: rounds }, (_, i) => [
    { id: `u${i}`, role: 'user' as const, text: `第 ${i + 1} 句：再給我一點想法`, at: '2026-11-21T08:00:00Z' },
    { id: `c${i}`, role: 'chef' as const, text: `想法 ${i + 1}。`, at: '2026-11-21T08:00:01Z' },
  ]).flat();

export const CHAT_CASES: ChatEvalCase[] = [
  {
    id: '01-ask-then-ideas',
    name: '說得很模糊，大廚反問一次；回答後給點子',
    ctx: TW,
    users: ['想吃點熱的', '麵'],
    fake: [
      () => out({ reply: '好，熱的最暖。', ask: '想吃飯還是麵？', summary: '想吃熱的' }),
      (ce) => out({
        reply: '那就來碗熱麵，高麗菜也能一起用掉。',
        summary: '想吃熱的麵',
        suggestions: [
          idea(ce, { title: '高麗菜蛋花湯麵', why: '高麗菜和蛋都在，十分鐘內的暖湯麵。', uses_pantry_ids: ['cabbage', 'egg'], other_ingredients: [{ name: '麵條' }] }),
          idea(ce, { slot: 'adventure', title: '薑絲排骨湯麵', why: '排骨湯頭暖得很，換個口味試試。', uses_pantry_ids: ['pork-ribs', 'ginger'], other_ingredients: [{ name: '麵條' }] }),
        ],
      }),
    ],
    expectation: '第一輪只問一個問題、沒有點子；使用者回答後直接給 1–3 個點子，不再追問。',
    assert: (sim) => {
      const k = kept(sim);
      return [
        ...(k[0]?.ask ? [] : ['第一輪沒有反問']),
        ...(k[0] && k[0].ideas.length > 0 ? ['有反問卻還給點子'] : []),
        ...(k[1]?.ask ? ['第二輪又追問'] : []),
        ...(k[1] && k[1].ideas.length === 0 ? ['第二輪沒有點子'] : []),
      ];
    },
  },
  {
    id: '02-allergy',
    name: '對蝦、花生過敏；使用者說「想吃海鮮、有蝦仁」',
    ctx: ALLERGY,
    users: ['今天想吃海鮮，冰箱有蝦仁'],
    fake: [
      (ce) => out({
        reply: '來點泰式風味的雞肉吧，香氣夠。',
        summary: '想吃海鮮風味、泰式',
        suggestions: [idea(ce, { title: '九層塔雞丁', why: '你愛泰式的香，九層塔和辣椒剛好。', uses_pantry_ids: ['chicken-thigh', 'thai-basil', 'chili-pepper', 'garlic'], other_ingredients: [{ name: '魚露' }] })],
      }),
    ],
    expectation: '回應與點子都沒有蝦、花生（含蝦醬、花生粉），也不用那包蝦仁；不說「不能吃蝦」之類的話。',
    assert: (sim) =>
      kept(sim).flatMap((r) => ['蝦', '花生'].filter((t) => textOf(r).includes(t)).map((t) => `回應提到「${t}」`)).concat(
        kept(sim).flatMap((r) => r.ideas.filter((i) => i.usesPantryIds.includes('shrimp')).map((i) => `${i.title}：用了蝦仁`)),
        kept(sim).flatMap((r) => r.mentioned.filter((m) => m.ingredientId === 'shrimp').map(() => '把蝦記成說過的食材')),
      ),
  },
  {
    id: '03-not-too-spicy',
    name: '先給點子，再說「不要太辣、再簡單一點」',
    ctx: TW,
    users: ['晚上想吃點熱的，有高麗菜和雞蛋', '不要太辣，再簡單一點'],
    fake: [
      (ce) => out({
        reply: '熱熱的炒一盤很剛好。', summary: '想吃熱的；有高麗菜、雞蛋',
        suggestions: [idea(ce, { title: '麻辣高麗菜', why: '高麗菜炒得香，帶一點辣很下飯。', uses_pantry_ids: ['cabbage'] })],
      }),
      (ce) => out({
        reply: '好，換成清爽的。', summary: '想吃熱的；有高麗菜、雞蛋；不要太辣、要簡單',
        preference_signals: [{ dimension_key: 'taste.spicy', affinity: -0.4, scope: 'today' }],
        suggestions: [idea(ce, { title: '高麗菜炒蛋', why: '兩樣食材就好，清清爽爽。', uses_pantry_ids: ['cabbage', 'egg'] })],
      }),
    ],
    expectation: '第二輪記得前面的條件（熱的、高麗菜、雞蛋），換成不辣、更簡單的點子；「今天不要太辣」記成今天的訊號，不是長期偏好。',
    assert: (sim) => {
      const second = sim.turns[1];
      const text = (second?.prompt.messages ?? []).map((m) => m.content).join('\n');
      const k = kept(sim);
      return [
        ...(text.includes('晚上想吃點熱的') ? [] : ['第二輪的提示詞沒有帶到前一輪的話']),
        ...(text.includes('給過的點子') ? [] : ['第二輪沒有列出給過的點子']),
        ...(k[1]?.signals.some((s) => s.dimensionKey === 'taste.spicy' && s.scope === 'long_term') ? ['今天的要求被記成長期偏好'] : []),
        ...(k[1]?.ideas.some((i) => i.title.includes('辣')) ? ['說了不要太辣，卻給辣的點子'] : []),
      ];
    },
  },
  {
    id: '04-mentioned-not-in-kitchen',
    name: '說了沒記在廚房的食材：鄰居送的筍子',
    ctx: TW,
    users: ['鄰居送了一些筍子，想煮湯', '那筍子要先燙嗎？'],
    fake: [
      (ce) => out({
        reply: '筍子煮湯最能吃出甜味！',
        summary: '想煮湯；有筍子',
        mentioned_ingredients: [{ text: '筍子', ingredient_id: 'bamboo-shoot' }],
        suggestions: [idea(ce, { title: '筍子排骨湯', why: '熱湯最暖，筍子煮湯甜得很自然。', uses_pantry_ids: ['pork-ribs', 'ginger', 'bamboo-shoot'] })],
      }),
      () => out({ reply: '要喔，切塊後滾水燙一下，澀味就去掉了。', summary: '想煮湯；有筍子' }),
    ],
    expectation: '點子用得上筍子（標成「你說的」，不是「廚房有」）；筍子不會被記進食材；第二輪直接回答問題、不給點子。',
    assert: (sim) => {
      const k = kept(sim);
      const second = (sim.turns[1]?.prompt.messages ?? []).at(-1)?.content ?? '';
      return [
        ...(k[0]?.ideas.some((i) => i.usesMentionedIds?.includes('bamboo-shoot')) ? [] : ['點子沒有用上說過的筍子']),
        ...(k[0]?.ideas.some((i) => i.usesPantryIds.includes('bamboo-shoot')) ? ['筍子被當成「廚房有」'] : []),
        ...(second.includes('bamboo-shoot｜') ? [] : ['第二輪的提示詞沒有帶到說過的筍子']),
        ...(k[1] && k[1].ideas.length > 0 ? ['只是問問題，卻給了點子'] : []),
      ];
    },
  },
  {
    id: '05-near-turn-limit',
    name: '已經聊了 18 輪：只送最近 10 輪加摘要；第 20 輪後不能再送',
    ctx: TW,
    start: emptyConversation({ turn_count: 18, summary: '想吃熱的；有高麗菜、雞蛋；不要太辣', messages: history(18) }),
    users: ['那就高麗菜炒蛋吧', '有什麼配菜嗎', '還可以再聊嗎'],
    fake: [
      () => out({ reply: '好選擇，簡單又下飯。', summary: '想吃熱的；有高麗菜、雞蛋；不要太辣；決定高麗菜炒蛋' }),
      () => out({ reply: '配個清湯或燙青菜就很夠了。', summary: '想吃熱的；有高麗菜、雞蛋；不要太辣；決定高麗菜炒蛋' }),
      () => out({ reply: '不會被送出的第 21 輪' }),
    ],
    expectation: '第 19、20 輪正常回應；提示詞只帶最近 10 輪原文與摘要；第 21 則不送（這一段滿了）。',
    assert: (sim) => {
      const first = sim.turns[0];
      return [
        ...((first?.prompt.messages.length ?? 0) === 21 ? [] : [`第 19 輪的提示詞有 ${first?.prompt.messages.length} 則（應該是最近 10 輪 20 則加這一則）`]),
        ...((first?.prompt.messages ?? []).some((m) => m.content.includes('第 1 句：')) ? ['送了太早的對話原文'] : []),
        ...(((first?.prompt.messages ?? []).at(-1)?.content ?? '').includes('不要太辣') ? [] : ['沒有帶摘要']),
        ...(sim.conv?.turn_count === 20 ? [] : [`最後是第 ${sim.conv?.turn_count} 輪`]),
        ...(sim.turns[2]?.full ? [] : ['第 21 則沒有被擋下']),
      ];
    },
  },
  {
    id: '06-chat-this-dish',
    name: '「想做筍子排骨湯」＋長期偏好「我不太吃羊肉」',
    ctx: TW,
    users: ['我不太吃羊肉，想做筍子排骨湯'],
    fake: [
      () => out({
        reply: '好選擇！排骨先汆燙去血水，筍子切塊一起小火慢燉，甜味就出來了。',
        summary: '想做筍子排骨湯；不吃羊肉',
        preference_signals: [{ dimension_key: 'protein.lamb', affinity: -0.6, scope: 'long_term' }],
        mentioned_ingredients: [{ text: '筍子', ingredient_id: 'bamboo-shoot' }],
      }),
    ],
    expectation: '給大方向與要注意的地方，不寫完整步驟與分量；沒有點子卡片；「不太吃羊肉」記成長期的偏好訊號。',
    assert: (sim) => {
      const k = kept(sim);
      return [
        ...(k[0]?.signals.some((s) => s.dimensionKey === 'protein.lamb' && s.scope === 'long_term' && s.affinity < 0) ? [] : ['沒有記下不吃羊肉']),
        ...(k[0] && k[0].ideas.length > 0 ? ['選好了一道菜，卻又給點子'] : []),
        ...(k[0] && [...k[0].reply].length > 150 ? ['回應太長'] : []),
      ];
    },
  },
];
