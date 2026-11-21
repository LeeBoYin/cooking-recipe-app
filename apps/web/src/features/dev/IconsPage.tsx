import { useEffect, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { equipmentTypes } from '@zhusha/equipment';
import { ingredients } from '@zhusha/ingredients';
import { ItemIcon } from '../../icons/ItemIcon.tsx';
import { EQUIPMENT_CATEGORIES } from '@zhusha/equipment';
import { INGREDIENT_CATEGORIES } from '@zhusha/ingredients';
import { COLOR_GROUPS, EQUIPMENT_GROUP, INGREDIENT_GROUP, type ColorGroup } from '../../icons/groups.ts';
import { loadIcons, type IconSet } from '../../icons/load.ts';

type Entry = { kind: 'ingredient' | 'equipment'; id: string; name: string; group: ColorGroup };

const ENTRIES: Entry[] = [
  ...ingredients.map((i) => ({ kind: 'ingredient' as const, id: i.id, name: i.name['zh-TW'], group: INGREDIENT_GROUP[i.category] })),
  ...equipmentTypes.map((e) => ({ kind: 'equipment' as const, id: e.id, name: e.name['zh-TW'], group: EQUIPMENT_GROUP[e.category] })),
];

// 只在開發模式有的 icon 總覽（/dev/icons）：依顏色群組列出所有食材與廚具，
// 標出有沒有專屬 icon，並能切淺色／深色。畫圖時用這頁檢查（17 第七節）
export function IconsPage() {
  const [dark, setDark] = useState(false);
  const [sets, setSets] = useState<Partial<Record<ColorGroup, IconSet>>>({});

  useEffect(() => {
    for (const g of COLOR_GROUPS) void loadIcons(g).then((s) => setSets((prev) => ({ ...prev, [g]: s })));
  }, []);

  const done = ENTRIES.filter((e) => sets[e.group]?.[e.id]).length;

  return (
    <div
      data-icon-theme={dark ? 'dark' : undefined}
      className="min-h-screen px-4 py-4"
      style={dark ? { background: '#2b2622', color: '#f1e9dc' } : undefined}
    >
      <div className="mx-auto flex max-w-[640px] flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <h1 className="m-0 text-heading font-bold"><FormattedMessage id="dev.icons.title" /></h1>
          <button type="button" aria-pressed={dark} onClick={() => setDark((d) => !d)} className="min-h-11 rounded-full border border-line-strong bg-transparent px-4 text-caption text-inherit">
            <FormattedMessage id="dev.icons.dark" />
          </button>
        </header>
        <p className="m-0 text-caption opacity-70">
          <FormattedMessage id="dev.icons.progress" values={{ done, total: ENTRIES.length }} />
        </p>
        <section>
          <h2 className="mx-0 mt-2 mb-2 text-card-title font-bold"><FormattedMessage id="dev.icons.categories" /></h2>
          <div className="grid grid-cols-4 gap-2">
            {INGREDIENT_CATEGORIES.map((c) => (
              <div key={c} className="flex flex-col items-center gap-1 rounded-card px-1 py-2 text-center text-small" style={{ background: dark ? '#3a332d' : '#fff' }}>
                <ItemIcon kind="ingredient" id={null} category={c} size={48} />
                <span className="text-[11px] opacity-60">{c}</span>
              </div>
            ))}
            {EQUIPMENT_CATEGORIES.map((c) => (
              <div key={c} className="flex flex-col items-center gap-1 rounded-card px-1 py-2 text-center text-small" style={{ background: dark ? '#3a332d' : '#fff' }}>
                <ItemIcon kind="equipment" id={null} category={c} size={48} />
                <span className="text-[11px] opacity-60">{c}</span>
              </div>
            ))}
          </div>
        </section>
        {COLOR_GROUPS.map((g) => {
          const items = ENTRIES.filter((e) => e.group === g);
          return (
            <section key={g}>
              <h2 className="mx-0 mt-2 mb-2 text-card-title font-bold">{g}（{items.length}）</h2>
              <div className="grid grid-cols-4 gap-2">
                {items.map((e) => {
                  const own = !!sets[g]?.[e.id];
                  return (
                    <div key={`${e.kind}-${e.id}`} className="flex flex-col items-center gap-1 rounded-card px-1 py-2 text-center text-small" style={{ background: dark ? '#3a332d' : '#fff' }}>
                      <ItemIcon kind={e.kind} id={e.id} size={48} />
                      <span>{e.name}</span>
                      <span className="text-[11px] opacity-60">{e.id}</span>
                      <span className={`text-[11px] font-bold ${own ? 'text-green' : 'opacity-60'}`}>
                        <FormattedMessage id={own ? 'dev.icons.own' : 'dev.icons.category'} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
