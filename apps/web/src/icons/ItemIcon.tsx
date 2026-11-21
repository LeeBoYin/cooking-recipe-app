import { useEffect, useState } from 'react';
import { getEquipmentType } from '@zhusha/equipment';
import { getIngredient } from '@zhusha/ingredients';
import { EQUIPMENT_CATEGORY_ICON, INGREDIENT_CATEGORY_ICON } from './categories.ts';
import { EQUIPMENT_GROUP, GROUP_BG, INGREDIENT_GROUP, type ColorGroup } from './groups.ts';
import { getLoadedIcons, loadIcons } from './load.ts';

type Props = {
  kind: 'ingredient' | 'equipment';
  /** 字典 ID；自訂的（沒有字典 ID）傳空，會用類別或「其他」的通用 icon */
  id?: string | null;
  /** 不傳就從字典查 */
  category?: string;
  size?: number;
  /** 只輸出線條、不畫圓底（線條放滿 size） */
  plain?: boolean;
  className?: string;
  /** 有文字說明時才傳；沒傳就當裝飾（aria-hidden） */
  label?: string;
};

function resolve(kind: Props['kind'], id: string | null | undefined, category: string | undefined) {
  if (kind === 'ingredient') {
    const cat = (category ?? getIngredient(id)?.category ?? 'other') as keyof typeof INGREDIENT_GROUP;
    const known = cat in INGREDIENT_GROUP ? cat : 'other';
    return { group: INGREDIENT_GROUP[known], fallback: INGREDIENT_CATEGORY_ICON[known] };
  }
  const cat = (category ?? getEquipmentType(id)?.category ?? 'special') as keyof typeof EQUIPMENT_GROUP;
  const known = cat in EQUIPMENT_GROUP ? cat : 'special';
  return { group: EQUIPMENT_GROUP[known], fallback: EQUIPMENT_CATEGORY_ICON[known] };
}

// 專屬 icon 載入前、或還沒畫的，先用類別通用 icon
function usePaths(group: ColorGroup, id: string | null | undefined, fallback: string[]) {
  const [, rerender] = useState(0);
  const set = getLoadedIcons(group);
  useEffect(() => {
    if (!set) void loadIcons(group).then(() => rerender((n) => n + 1)).catch(() => undefined);
  }, [group, set]);
  return (id ? set?.[id] : undefined) ?? fallback;
}

export function iconPathsFor(group: ColorGroup, id: string | null | undefined): string[] | undefined {
  return id ? getLoadedIcons(group)?.[id] : undefined;
}

// 食材與廚具的 icon：墨色線條，背後疊一層依類別上色的淡色圓底（17 第七節）。
// 線條格式：24×24、四邊留 2、線寬 1.75（放進圓底時用 1）、圓角、不寫死顏色。
export function ItemIcon({ kind, id, category, size = 28, plain, className, label }: Props) {
  const { group, fallback } = resolve(kind, id, category);
  const paths = usePaths(group, id, fallback);
  const inner = plain ? size : Math.round(size * 0.6);
  const svg = (
    <svg
      width={inner}
      height={inner}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={plain ? 1.75 : 1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      className={plain ? className : undefined}
      style={plain ? undefined : { color: 'var(--icon-ink, var(--color-ink))' }}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
  if (plain) return svg;
  return (
    <span
      aria-hidden={label ? undefined : true}
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${className ?? ''}`}
      style={{ width: size, height: size, background: GROUP_BG[group] }}
    >
      {svg}
    </span>
  );
}
