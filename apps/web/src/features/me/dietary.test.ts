import { allergens } from '@zhusha/ingredients';
import { describe, expect, it } from 'vitest';
import { visibleAllergens } from './DietaryEditor.tsx';

describe('visibleAllergens', () => {
  it('台灣：列上層（甲殼類），不列蝦、蟹；美國才把小麥單獨列出', () => {
    const tw = visibleAllergens(allergens, ['TW'], []).map((a) => a.id);
    expect(tw).toContain('crustacean');
    expect(tw).not.toContain('shrimp');
    expect(tw).not.toContain('wheat');
    expect(visibleAllergens(allergens, ['US'], []).map((a) => a.id)).toContain('wheat');
  });
  it('已經選了的一定列出', () => {
    expect(visibleAllergens(allergens, ['TW'], ['shrimp']).map((a) => a.id)).toContain('shrimp');
  });
});
