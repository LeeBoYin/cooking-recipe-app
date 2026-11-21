import type { ColorGroup } from './groups.ts';

export type IconSet = Record<string, string[]>;

// 依群組動態載入專屬 icon，221 個不會全進主程式
const LOADERS: Record<ColorGroup, () => Promise<{ icons: IconSet }>> = {
  veg: () => import('./veg.ts'),
  fruit: () => import('./fruit.ts'),
  meat: () => import('./meat.ts'),
  dairy: () => import('./dairy.ts'),
  staple: () => import('./staple.ts'),
  seasoning: () => import('./seasoning.ts'),
  equipment: () => import('./equipment.ts'),
};

const loaded = new Map<ColorGroup, IconSet>();
const pending = new Map<ColorGroup, Promise<IconSet>>();

export function getLoadedIcons(group: ColorGroup): IconSet | undefined {
  return loaded.get(group);
}

export function loadIcons(group: ColorGroup): Promise<IconSet> {
  const hit = loaded.get(group);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(group);
  if (!p) {
    p = LOADERS[group]().then((m) => {
      loaded.set(group, m.icons);
      return m.icons;
    });
    pending.set(group, p);
  }
  return p;
}
