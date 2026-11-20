import { preferenceDimensions, quizItems } from '@zhusha/taste';
import { describe, expect, it } from 'vitest';
import { createRng } from './rng.ts';
import { RHYTHM, finishSession, itemValue, nextStep, startSession, submitAnswers, type QuizEnv, type QuizMode, type QuizSession, type QuizStep } from './session.ts';
import { emptyProfile, type QuizAnswer, type TasteQuizItem } from './types.ts';

const NOW = '2026-11-20T00:00:00.000Z';
const baseEnv: QuizEnv = { items: quizItems, dimensions: preferenceDimensions, regionCodes: ['TW'], allergenIds: [], restrictionIds: [] };

function randomAnswer(item: TasteQuizItem, rng: () => number): QuizAnswer {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]!;
  switch (item.type) {
    case 'dish_card': return { type: 'dish_card', value: pick(['love', 'try', 'ok', 'nope'] as const) };
    case 'quick_fire': return { type: 'quick_fire', value: pick(['love', 'ok', 'no'] as const) };
    case 'this_or_that': return { type: 'this_or_that', choice: pick([0, 1] as const) };
    case 'spectrum': return { type: 'spectrum', point: pick([0, 1, 2, 3, 4] as const) };
    default: return { type: 'context', choices: [0] };
  }
}

// 跑完一次流程，回傳每一步與最後的流程
function run(mode: QuizMode, seed: string, env: QuizEnv = baseEnv, answerer?: (item: TasteQuizItem) => QuizAnswer, from?: QuizSession) {
  const rng = createRng(7);
  let session = from ?? startSession(emptyProfile(), mode, seed, env);
  const steps: Extract<QuizStep, { kind: 'items' }>[] = [];
  for (let i = 0; i < 80; i++) {
    const step = nextStep(session, env);
    if (step.kind === 'done') return { session, steps, done: step.reason };
    steps.push(step);
    session = submitAnswers(session, step, step.items.map((it) => answerer?.(it) ?? randomAnswer(it, rng)), env, NOW);
  }
  throw new Error('流程沒有結束');
}

describe('挑題是純函式', () => {
  it('同樣的輸入與種子，挑出同一題', () => {
    const s = startSession(emptyProfile(), 'quick', 'seed-1', baseEnv);
    expect(nextStep(s, baseEnv)).toEqual(nextStep(s, baseEnv));
  });

  it('同一個種子跑完整個流程，結果完全一樣；換種子會不同', () => {
    const ids = (r: ReturnType<typeof run>) => r.steps.flatMap((s) => s.items.map((i) => i.id));
    expect(ids(run('quick', 'a'))).toEqual(ids(run('quick', 'a')));
    const seeds = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(new Set(seeds.map((x) => ids(run('quick', x))[0])).size).toBeGreaterThan(1);
  });

  it('不改傳進來的流程', () => {
    const s = startSession(emptyProfile(), 'quick', 'x', baseEnv);
    const snapshot = JSON.stringify(s);
    const step = nextStep(s, baseEnv);
    if (step.kind === 'items') submitAnswers(s, step, step.items.map((i) => randomAnswer(i, createRng(1))), baseEnv, NOW);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('快速模式', () => {
  const result = run('quick', 'quick-1');

  it('照節奏表出題型（沒有矛盾追問時）；快問快答一組 4 題', () => {
    const prefs = result.steps.filter((s) => s.phase === 'preference' && !s.contradiction);
    expect(prefs.map((s) => s.items[0]!.type)).toEqual(RHYTHM.quick.slice(0, prefs.length));
    for (const s of prefs.filter((x) => x.items[0]!.type === 'quick_fire')) expect(s.items).toHaveLength(4);
  });

  it('喜好題最多 12 題，之後固定問三題情境題（時間、煮給誰、週末）', () => {
    const prefs = result.steps.filter((s) => s.phase === 'preference');
    expect(prefs.length).toBeLessThanOrEqual(12);
    expect(prefs.length).toBeGreaterThanOrEqual(8);
    const ctx = result.steps.filter((s) => s.phase === 'context').map((s) => s.items[0]!.id);
    expect(ctx).toEqual(['ctx_time', 'ctx_cooks_for', 'ctx_weekend']);
    expect(result.steps.slice(-3).every((s) => s.phase === 'context')).toBe(true);
    expect(result.done).toBeDefined();
  });

  it('不會重複問同一題，也不會問 TW 以外的題（地區過濾）', () => {
    const ids = result.steps.flatMap((s) => s.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    const jp = run('quick', 'jp', { ...baseEnv, regionCodes: ['JP'] });
    const regions = new Map(quizItems.map((q) => [q.id, q.regions]));
    for (const id of jp.steps.flatMap((s) => s.items.map((i) => i.id))) expect(regions.get(id)).toContain('JP');
  });

  it('結束後寫入最後探索時間，已答的題目都記下來', () => {
    const { profile } = finishSession(result.session, NOW);
    expect(profile.lastExploredAt).toBe(NOW);
    expect(profile.answeredItemIds.length).toBe(result.steps.reduce((n, s) => n + s.items.length, 0));
    expect(profile.context.timePreference).toBeDefined();
    expect(profile.context.cooksFor).toBeDefined();
  });

  it('結束後不再出題', () => {
    expect(nextStep(finishSession(result.session, NOW).session, baseEnv)).toEqual({ kind: 'done', reason: 'finished' });
  });
});

describe('硬限制先篩', () => {
  it('蝦蟹過敏的人看不到冬蔭功；不吃牛的人看不到牛肉題', () => {
    const env = { ...baseEnv, allergenIds: ['crustacean'], restrictionIds: ['no-beef', 'vegan'] };
    for (const seed of ['a', 'b', 'c', 'd']) {
      const ids = run('quick', seed, env).steps.flatMap((s) => s.items.map((i) => i.id));
      expect(ids).not.toContain('card_tom_yum');
      expect(ids).not.toContain('card_beef_noodle_soup');
      expect(ids).not.toContain('card_lu_rou_fan'); // 全素
    }
  });

  it('沒有題目可出就結束，不會當掉', () => {
    const r = run('quick', 'x', { ...baseEnv, items: [] });
    expect(r.steps).toEqual([]);
    expect(r.done).toBe('no_more_questions');
  });
});

describe('這一格沒題目時改出下一格的題型', () => {
  it('沒有光譜題時照常往下出', () => {
    const items = quizItems.filter((q) => q.type !== 'spectrum');
    const r = run('quick', 's', { ...baseEnv, items });
    expect(r.steps.some((s) => s.items[0]!.type === 'spectrum')).toBe(false);
    expect(r.steps.filter((s) => s.phase === 'preference').length).toBeGreaterThan(5);
  });
});

describe('矛盾時追問一題', () => {
  // 喜歡麻婆豆腐（辣 +0.6）、不愛冬蔭功（辣 −0.5）→ 插入「辣」的光譜
  it('同維度方向相反、力道都 ≥ 0.4：下一格插入該維度的光譜，且只插一次', () => {
    const env: QuizEnv = { ...baseEnv, items: quizItems.filter((q) => ['card_mapo_tofu', 'card_tom_yum', 'spec_spicy', 'card_oyakodon', 'card_pho', 'card_ramen', 'spec_sour'].includes(q.id)) };
    let session = startSession(emptyProfile(), 'quick', 'c', env);
    const answerCard = (id: string, value: 'love' | 'nope') => {
      const item = env.items.find((i) => i.id === id)!;
      session = submitAnswers(session, { kind: 'items', phase: 'preference', items: [item], slot: 0 }, [{ type: 'dish_card', value }], env, NOW);
    };
    answerCard('card_mapo_tofu', 'love');
    answerCard('card_tom_yum', 'nope');
    const step = nextStep(session, env);
    expect(step).toMatchObject({ kind: 'items', contradiction: true });
    expect(step.kind === 'items' && step.items[0]!.id).toBe('spec_spicy');
    if (step.kind !== 'items') return;
    const slotBefore = session.slot;
    session = submitAnswers(session, step, [{ type: 'spectrum', point: 2 }], env, NOW);
    expect(session.slot).toBe(slotBefore); // 追問不佔節奏表的格子
    const after = nextStep(session, env);
    expect(after.kind === 'items' && after.contradiction).toBeFalsy();
  });

  it('光譜題已答過就不插', () => {
    const env: QuizEnv = { ...baseEnv, items: quizItems.filter((q) => ['card_mapo_tofu', 'card_tom_yum', 'spec_spicy', 'card_pho'].includes(q.id)) };
    let session = startSession(emptyProfile(), 'quick', 'c', env);
    session = { ...session, profile: { ...session.profile, answeredItemIds: ['spec_spicy'] } };
    for (const [id, value] of [['card_mapo_tofu', 'love'], ['card_tom_yum', 'nope']] as const) {
      const item = env.items.find((i) => i.id === id)!;
      session = submitAnswers(session, { kind: 'items', phase: 'preference', items: [item], slot: 0 }, [{ type: 'dish_card', value }], env, NOW);
    }
    const step = nextStep(session, env);
    expect(step.kind === 'items' && step.contradiction).toBeFalsy();
  });
});

describe('題目價值', () => {
  const s0 = startSession(emptyProfile(), 'quick', 'v', baseEnv);
  const item = (id: string) => quizItems.find((q) => q.id === id) as TasteQuizItem;

  it('把握越高價值越低', () => {
    const before = itemValue(item('card_tom_yum'), s0, baseEnv);
    const sure = { ...s0, profile: { ...s0.profile, dims: Object.fromEntries(Object.keys(item('card_tom_yum').mapping).map((k) => [k, { affinity: 1, confidence: 0.9, source: 'explored' as const, updatedAt: NOW }])) } };
    expect(itemValue(item('card_tom_yum'), sure, baseEnv)).toBeLessThan(before * 0.2);
  });

  it('不喜歡的大區，下層題目整題價值降到 0.2 倍', () => {
    const mk = (affinity: number) => ({ ...s0, profile: { ...s0.profile, dims: { 'cuisine.southeast_asia': { affinity, confidence: 0.6, source: 'explored' as const, updatedAt: NOW } } } });
    expect(itemValue(item('card_pad_krapow'), mk(-0.8), baseEnv)).toBeCloseTo(itemValue(item('card_pad_krapow'), mk(0.8), baseEnv) * 0.2);
  });

  it('喜歡的題目的 followUps 加分 ×1.3', () => {
    const answered = { ...s0, records: [{ itemId: 'card_tom_yum', strengths: {}, liked: true }] };
    const notLiked = { ...s0, records: [{ itemId: 'card_tom_yum', strengths: {}, liked: false }] };
    expect(itemValue(item('card_pad_krapow'), answered, baseEnv)).toBeCloseTo(itemValue(item('card_pad_krapow'), notLiked, baseEnv) * 1.3);
  });
});

describe('深入模式', () => {
  it('接在快速模式之後：總共最多 25 題喜好題，且不再問情境題', () => {
    const quick = run('quick', 'q');
    const prior = finishSession(quick.session, NOW).profile;
    const deepStart = startSession(prior, 'deep', 'd', baseEnv);
    const deep = run('deep', 'd', baseEnv, undefined, deepStart);
    expect(deep.steps.every((s) => s.phase === 'preference')).toBe(true);
    expect(deep.steps.length).toBeGreaterThan(0);
    expect(deep.session.baseCount + deep.session.asked).toBeLessThanOrEqual(25);
  });
});

describe('題庫整體（61 題）', () => {
  it('各種亂答 × 各地區 × 各種限制，流程都會結束，快速模式喜好題在 8～12 題', () => {
    for (let i = 0; i < 30; i++) {
      for (const regionCodes of [['TW'], ['US-CA'], ['JP']]) {
        const r = run('quick', `fuzz-${i}`, { ...baseEnv, regionCodes, restrictionIds: i % 3 === 0 ? ['no-pork'] : [] });
        const prefs = r.steps.filter((s) => s.phase === 'preference').length;
        expect(prefs).toBeLessThanOrEqual(12);
        expect(prefs).toBeGreaterThanOrEqual(8);
      }
    }
  });
});
