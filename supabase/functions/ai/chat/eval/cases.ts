// 和大廚聊聊的評估集：9 段劇本式對話（M1a-07 起；M1a-09f 改成多輪收斂：盤點、問風味、收斂、直接給我點子、食材搭不起來）。同一份資料有兩種用途：
// 1. 自動測試（chat.test.ts）：每一輪用事先寫好的「假的 AI 回應」，測整條流程（提示詞、檢查、存對話的規則），進 CI。
// 2. 手動實跑（run.ts）：真的呼叫 Claude（Sonnet 5.5），看回應合不合理、口吻對不對；不進 CI（要花錢，也需要人打分）。
// 使用者的話是固定劇本；實跑時大廚的回應不同，所以 assert 只檢查「不管 AI 怎麼回都該成立」的事。
import type { RawIdea } from '../../home/types.ts';
import { ctx, eq, FREQ, likes, pantry, NOW } from '../../home/eval/cases.ts';
import type { HomeContextRow } from '../../home/types.ts';
import type { ChatEnv } from '../env.ts';
import type { ChatConversationRow, RawChatOutput } from '../types.ts';
import { mentionCoverage } from '../check.ts';
import { emptyConversation, type ScriptedUser, type Simulation } from './simulate.ts';

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
  reply: '好啊，來看看。', ask: null, hint: null, suggestions: [], mentioned_ingredients: [], preference_signals: [], user_wants_ideas: false, summary: '', ...over,
});

export interface ChatEvalCase {
  id: string;
  name: string;
  ctx: HomeContextRow;
  start?: ChatConversationRow;
  users: ScriptedUser[];
  // 假的 AI 回應（自動測試用）：每一輪一個
  // attempt：0 是第一次，1 是程式請大廚重寫的那一次
  fake: ((ce: ChatEnv, attempt: number) => RawChatOutput)[];
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

const textOf = (r: { reply: string; ask: { question: string; options: string[] } | null; ideas: { title: string; why: string }[] }) => [r.reply, r.ask ? `${r.ask.question} ${r.ask.options.join(' ')}` : '', ...r.ideas.map((i) => `${i.title} ${i.why}`)].join(' ');
const ask = (question: string, options: string[], multi = false) => ({ question, options, multi });
// 每一輪通過檢查的內容
const kept = (sim: Simulation) => sim.turns.flatMap((t) => (t.checked && t.checked.ok ? [{ user: t.user, ...t.checked }] : []));

// 50 句交替的對話（給「20 輪附近」用）
const history = (rounds: number): ChatConversationRow['messages'] =>
  Array.from({ length: rounds }, (_, i) => [
    { id: `u${i}`, role: 'user' as const, text: `第 ${i + 1} 句：再給我一點想法`, at: '2026-11-21T08:00:00Z' },
    { id: `c${i}`, role: 'chef' as const, text: `想法 ${i + 1}。`, at: '2026-11-21T08:00:01Z' },
  ]).flat();

// 每一輪大廚的回應：還沒給點子（盤點、問風味）時要有選項，給了點子最多 2 個
const MIN_TURNS_FOR_IDEAS = 3;
const earlyIdeas = (sim: Simulation) =>
  sim.turns.flatMap((t, i) => (t.checked?.ok && t.checked.ideas.length > 0 && t.chefTurn < MIN_TURNS_FOR_IDEAS && !wanted(sim, i) ? [`第 ${t.chefTurn} 輪就給了點子，使用者沒要求`] : []));
const wanted = (sim: Simulation, i: number): boolean => sim.turns[i]?.prompt.messages.at(-1)?.content.includes('使用者是否按了「直接給我點子」：是') === true;
const tooManyIdeas = (sim: Simulation) => kept(sim).flatMap((r) => (r.ideas.length > 2 ? [`一次給了 ${r.ideas.length} 個點子`] : []));
// hint：有反問時不該有；有的話不超過 20 字（程式檢查會拿掉不合格的，這裡看 AI 原始輸出有沒有照規矩）
const badHints = (sim: Simulation) => sim.turns.flatMap((t) => (t.raw && typeof t.raw.hint === 'string' && ([...t.raw.hint].length > 20 || (t.raw.ask && t.raw.hint)) ? [`第 ${t.chefTurn} 輪的 hint 太長或和反問同時出現`] : []));
const badOptions = (sim: Simulation) => kept(sim).flatMap((r) => (r.ask && (r.ask.options.length < 2 || r.ask.options.length > 4) ? ['選項不是 2 到 4 個'] : []));

export const CHAT_CASES: ChatEvalCase[] = [
  {
    id: '01-inventory-flavor-converge',
    name: '三步收斂：盤點食材、問風味、收斂成點子',
    ctx: TW,
    users: ['今天想煮點什麼，冰箱有高麗菜和雞蛋', '沒有了，就這些', '清爽一點、有湯的'],
    fake: [
      () => out({ reply: '高麗菜加雞蛋，很有想像空間。', ask: ask('手邊還有別的嗎？', ['豆腐', '排骨', '沒有了'], true), summary: '有高麗菜、雞蛋', mentioned_ingredients: [{ text: '高麗菜', ingredient_id: 'cabbage' }, { text: '雞蛋', ingredient_id: 'egg' }] }),
      () => out({ reply: '好，那來想想想吃什麼風味。', ask: ask('想吃哪一種感覺？', ['清爽', '下飯', '暖胃']), summary: '有高麗菜、雞蛋' }),
      (ce) => out({
        reply: '清爽有湯，那就用高麗菜和蛋做。',
        summary: '有高麗菜、雞蛋；想吃清爽有湯',
        suggestions: [
          idea(ce, { title: '高麗菜蛋花湯', why: '兩樣都用上，十分鐘的清爽暖湯。', uses_pantry_ids: ['cabbage', 'egg'] }),
          idea(ce, { slot: 'adventure', title: '高麗菜蛋花薑絲湯', why: '加一點薑絲更暖，換個香氣。', uses_pantry_ids: ['cabbage', 'egg', 'ginger'] }),
        ],
      }),
    ],
    expectation: '第 1、2 輪各問一個問題並附 2 到 4 個選項（先盤點食材、再問風味），不給點子；第 3 輪給 1 到 2 個點子，並用上高麗菜與雞蛋。',
    assert: (sim) => {
      const k = kept(sim);
      return [
        ...earlyIdeas(sim),
        ...tooManyIdeas(sim),
        ...badOptions(sim),
        ...badHints(sim),
        ...(k[0] && !k[0].ask ? ['第 1 輪沒有問問題'] : []),
        ...(k[1] && !k[1].ask ? ['第 2 輪沒有問問題'] : []),
        ...(k[2] && k[2].ideas.length === 0 ? ['第 3 輪沒有給點子'] : []),
        ...(k[2] && k[2].ideas.some((i) => mentionCoverage(i, sim.conv?.mentioned_ingredients ?? []) < 2) ? ['點子沒有用到提到的兩樣食材'] : []),
      ];
    },
  },
  {
    id: '02-allergy',
    name: '對蝦、花生過敏；使用者說「想吃海鮮、有蝦仁」，一路聊到點子',
    ctx: ALLERGY,
    users: ['今天想吃海鮮，冰箱有蝦仁', '泰式的，下飯', '就這樣，直接決定吧'],
    fake: [
      () => out({ reply: '泰式風味很香，來聊聊手邊的食材。', ask: ask('還有什麼想用掉的？', ['雞腿肉', '九層塔', '都可以'], true), summary: '想吃海鮮風味' }),
      () => out({ reply: '好，下飯的泰式。', ask: ask('想要多辣？', ['微辣', '中辣', '很辣']), summary: '想吃海鮮風味、泰式、下飯' }),
      (ce) => out({
        reply: '來點泰式風味的雞肉吧，香氣夠。',
        summary: '想吃海鮮風味、泰式、下飯',
        suggestions: [idea(ce, { title: '九層塔雞丁', why: '你愛泰式的香，九層塔和辣椒剛好。', uses_pantry_ids: ['chicken-thigh', 'thai-basil', 'chili-pepper', 'garlic'], other_ingredients: [{ name: '魚露' }] })],
      }),
    ],
    expectation: '每一輪的回應、選項與點子都沒有蝦、花生（含蝦醬、花生粉），也不用那包蝦仁；不說「不能吃蝦」之類的話。',
    assert: (sim) =>
      kept(sim).flatMap((r) => ['蝦', '花生'].filter((t) => textOf(r).includes(t)).map((t) => `回應提到「${t}」`)).concat(
        kept(sim).flatMap((r) => r.ideas.filter((i) => i.usesPantryIds.includes('shrimp')).map((i) => `${i.title}：用了蝦仁`)),
        kept(sim).flatMap((r) => r.mentioned.filter((m) => m.ingredientId === 'shrimp').map(() => '把蝦記成說過的食材')),
        earlyIdeas(sim),
      ),
  },
  {
    id: '03-give-me-ideas-now',
    name: '直接給我點子：第 1 輪就按了按鈕',
    ctx: TW,
    users: [{ text: '直接給我點子', wantIdeas: true }],
    fake: [
      (ce) => out({
        reply: '好，先來兩個簡單的。',
        user_wants_ideas: true,
        summary: '想直接看點子',
        suggestions: [
          idea(ce, { title: '高麗菜炒蛋', why: '兩樣食材就好，快手又下飯。', uses_pantry_ids: ['cabbage', 'egg'] }),
          idea(ce, { slot: 'adventure', title: '薑絲豆腐蛋花湯', why: '暖暖的小湯，換個口味。', uses_pantry_ids: ['tofu', 'egg', 'ginger'] }),
        ],
      }),
    ],
    expectation: '使用者按了「直接給我點子」：不再追問，第 1 輪就給 1 到 2 個點子，沒有反問。',
    assert: (sim) => {
      const k = kept(sim);
      return [...tooManyIdeas(sim), ...(k[0] && k[0].ideas.length === 0 ? ['按了「直接給我點子」卻沒有給點子'] : []), ...(k[0]?.ask ? ['按了「直接給我點子」卻還在反問'] : [])];
    },
  },
  {
    id: '04-too-early-rewrite',
    name: '太早給點子：第 1 輪沒有人要求，程式請大廚重寫成反問',
    ctx: TW,
    users: ['有高麗菜和雞蛋，今天想吃點熱的'],
    fake: [
      (ce, attempt) =>
        attempt === 0
          ? out({ reply: '直接來兩道吧。', suggestions: [idea(ce, { title: '高麗菜炒蛋', why: '兩樣食材就好。', uses_pantry_ids: ['cabbage', 'egg'] })] })
          : out({ reply: '熱的好，高麗菜和蛋都能用。', ask: ask('還有別的食材嗎？', ['豆腐', '排骨', '沒有了'], true), summary: '想吃熱的；有高麗菜、雞蛋' }),
    ],
    expectation: '第 1 輪不給點子：就算 Claude 第一次給了，程式也會丟掉並請它重寫成反問（假回應的第二次嘗試會被用到）。',
    assert: (sim) => [...earlyIdeas(sim), ...badOptions(sim), ...badHints(sim), ...(sim.turns[0]?.checked?.ok ? [] : ['第 1 輪沒有存下回應'])],
  },
  {
    id: '05-ingredients-dont-fit',
    name: '提了 4 樣食材、其中一樣搭不起來；點子要用到大部分，剩下的說留到下次',
    ctx: TW,
    users: [{ text: '有高麗菜、雞蛋、豆腐，還有一包巧克力，直接給我點子', wantIdeas: true }],
    fake: [
      (ce, attempt) => {
        const mentioned = [
          { text: '高麗菜', ingredient_id: 'cabbage' },
          { text: '雞蛋', ingredient_id: 'egg' },
          { text: '豆腐', ingredient_id: 'tofu' },
          { text: '巧克力', ingredient_id: null },
        ];
        return attempt === 0
          ? out({ reply: '先給你一道。', user_wants_ideas: true, mentioned_ingredients: mentioned, suggestions: [idea(ce, { title: '清炒高麗菜', why: '簡單快手。', uses_pantry_ids: ['cabbage'] })] })
          : out({
              reply: '高麗菜、雞蛋、豆腐一起很搭；巧克力適合留到下次做點心。',
              user_wants_ideas: true,
              mentioned_ingredients: mentioned,
              summary: '有高麗菜、雞蛋、豆腐、巧克力',
              suggestions: [
                idea(ce, { title: '高麗菜豆腐炒蛋', why: '三樣都用上，下飯又快。', uses_pantry_ids: ['cabbage', 'egg', 'tofu'] }),
                idea(ce, { slot: 'adventure', title: '高麗菜蛋豆腐羹', why: '用同樣三樣做成熱羹，換個口感。', uses_pantry_ids: ['cabbage', 'egg', 'tofu'] }),
              ],
            });
      },
    ],
    expectation: '每個點子用到提到的 4 樣食材裡的大部分（至少 2 樣；不會只用 1 樣）；搭不起來的巧克力，大廚在回應裡說適合留到下次，語氣不催促。',
    assert: (sim) => {
      const k = kept(sim);
      return [
        ...tooManyIdeas(sim),
        ...(k[0] ? k[0].ideas.flatMap((i) => (mentionCoverage(i, k[0]?.mentioned ?? []) <= 1 ? [`${i.title}：只用到 1 樣提到的食材`] : [])) : ['沒有回應']),
        ...(k[0] && !k[0].reply.includes('巧克力') ? ['沒有說巧克力適合留到下次'] : []),
      ];
    },
  },
  {
    id: '06-mentioned-not-in-kitchen',
    name: '說了沒記在廚房的食材：鄰居送的筍子',
    ctx: TW,
    users: [{ text: '鄰居送了一些筍子，想煮湯，直接給我點子', wantIdeas: true }, '那筍子要先燙嗎？'],
    fake: [
      (ce) => out({
        reply: '筍子煮湯最能吃出甜味！',
        user_wants_ideas: true,
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
    id: '07-not-too-spicy',
    name: '給了點子之後，說「不要太辣、再簡單一點」：對話不結束，接著換點子',
    ctx: TW,
    users: [{ text: '晚上想吃點熱的，有高麗菜和雞蛋，直接給我點子', wantIdeas: true }, '不要太辣，再簡單一點'],
    fake: [
      (ce) => out({
        reply: '熱熱的炒一盤很剛好。', user_wants_ideas: true, summary: '想吃熱的；有高麗菜、雞蛋',
        suggestions: [idea(ce, { title: '麻辣高麗菜', why: '高麗菜炒得香，帶一點辣很下飯。', uses_pantry_ids: ['cabbage'] })],
      }),
      (ce) => out({
        reply: '好，換成清爽的。', summary: '想吃熱的；有高麗菜、雞蛋；不要太辣、要簡單',
        preference_signals: [{ dimension_key: 'taste.spicy', affinity: -0.4, scope: 'today' }],
        suggestions: [idea(ce, { title: '高麗菜炒蛋', why: '兩樣食材就好，清清爽爽。', uses_pantry_ids: ['cabbage', 'egg'] })],
      }),
    ],
    expectation: '第二輪記得前面的條件（熱的、高麗菜、雞蛋），換成不辣、更簡單的點子；「今天不要太辣」記成今天的訊號，不是長期偏好；給過點子後仍然可以繼續聊、再給新的點子。',
    assert: (sim) => {
      const second = sim.turns[1];
      const text = (second?.prompt.messages ?? []).map((m) => m.content).join('\n');
      const k = kept(sim);
      return [
        ...(text.includes('晚上想吃點熱的') ? [] : ['第二輪的提示詞沒有帶到前一輪的話']),
        ...(text.includes('給過的點子') ? [] : ['第二輪沒有列出給過的點子']),
        ...(k[1]?.signals.some((s) => s.dimensionKey === 'taste.spicy' && s.scope === 'long_term') ? ['今天的要求被記成長期偏好'] : []),
        ...(k[1]?.ideas.some((i) => i.title.includes('辣')) ? ['說了不要太辣，卻給辣的點子'] : []),
        ...tooManyIdeas(sim),
      ];
    },
  },
  {
    id: '08-near-turn-limit',
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
    id: '09-long-term-preference',
    name: '長期偏好「我不太吃羊肉」＋說了一道想吃的菜',
    ctx: TW,
    users: ['我不太吃羊肉，今天想吃筍子排骨湯'],
    fake: [
      () => out({
        reply: '好選擇！排骨先汆燙去血水，筍子切塊一起小火慢燉，甜味就出來了。',
        summary: '想吃筍子排骨湯；不吃羊肉',
        preference_signals: [{ dimension_key: 'protein.lamb', affinity: -0.6, scope: 'long_term' }],
        mentioned_ingredients: [{ text: '筍子', ingredient_id: 'bamboo-shoot' }],
      }),
    ],
    expectation: '接住使用者想吃的菜，不寫完整步驟與分量；「不太吃羊肉」記成長期的偏好訊號。',
    assert: (sim) => {
      const k = kept(sim);
      return [
        ...(k[0]?.signals.some((s) => s.dimensionKey === 'protein.lamb' && s.scope === 'long_term' && s.affinity < 0) ? [] : ['沒有記下不吃羊肉']),
        ...(k[0] && [...k[0].reply].length > 150 ? ['回應太長'] : []),
        ...earlyIdeas(sim),
      ];
    },
  },
];
