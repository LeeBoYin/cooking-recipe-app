import { describe, expect, it } from 'vitest';
import { mergeKeepingOriginals, storyWithDictation, storyWithoutDictation } from './dictation.ts';

describe('mergeKeepingOriginals', () => {
  it('作者原本的項目依序原樣保留，其他是新的', () => {
    expect(mergeKeepingOriginals(['蛋 2 顆', '鹽'], ['蛋 2 顆', '蒜頭', '鹽', '麻油'], 60, 200)).toEqual([
      { text: '蛋 2 顆', from: 0 },
      { text: '蒜頭', from: null },
      { text: '鹽', from: 1 },
      { text: '麻油', from: null },
    ]);
  });
  it('作者的項目被改、被刪、換順序就整份不採用', () => {
    expect(mergeKeepingOriginals(['蛋 2 顆', '鹽'], ['蛋 3 顆', '鹽'], 60, 200)).toBeNull();
    expect(mergeKeepingOriginals(['蛋 2 顆', '鹽'], ['蛋 2 顆'], 60, 200)).toBeNull();
    expect(mergeKeepingOriginals(['蛋 2 顆', '鹽'], ['鹽', '蛋 2 顆'], 60, 200)).toBeNull();
  });
  it('重複寫作者已有的、或新項目彼此重複的都拿掉；空字串略過', () => {
    expect(mergeKeepingOriginals(['蛋'], ['蛋', '蛋', '', '  ', '糖', '糖'], 60, 200)?.map((i) => i.text)).toEqual(['蛋', '糖']);
  });
  it('超過上限從後面的新項目開始拿掉；單項過長截短；作者的永遠留著', () => {
    const out = mergeKeepingOriginals(['a', 'b'], ['a', 'n1', 'n2', 'b', 'n3'], 3, 200);
    expect(out?.map((i) => i.text)).toEqual(['a', 'n1', 'b']);
    expect(mergeKeepingOriginals([], ['字'.repeat(10)], 5, 4)?.[0]?.text).toBe('字字字字');
  });
  it('作者的項目前後有空白：比對時忽略，保留作者原本的寫法', () => {
    expect(mergeKeepingOriginals([' 蛋 '], ['蛋'], 60, 200)).toEqual([{ text: ' 蛋 ', from: 0 }]);
  });
});

describe('心得裡的原話', () => {
  it('心得是空的：整段原話就是心得，之後視為空的', () => {
    const s = storyWithDictation('', '培根先煎');
    expect(s).toBe('培根先煎');
    expect(storyWithoutDictation(s, '培根先煎')).toBe('');
  });
  it('心得已經有字：原話接在後面，之後能拆回作者自己寫的部分', () => {
    const s = storyWithDictation('下班很累。', '培根先煎');
    expect(s).toBe('下班很累。\n\n培根先煎');
    expect(storyWithoutDictation(s, '培根先煎')).toBe('下班很累。');
  });
  it('原話被改過或不見了：不算原話', () => {
    expect(storyWithoutDictation('我自己重寫了', '培根先煎')).toBeNull();
    expect(storyWithoutDictation('培根先煎，加了一點', '培根先煎')).toBeNull();
    expect(storyWithoutDictation('x', '')).toBeNull();
  });
});
