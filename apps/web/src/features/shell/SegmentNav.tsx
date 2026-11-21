import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

export type SegmentItem = { to: string; end?: boolean; label: ReactNode };

// 兩段式切換（廚房的「食材／廚具」、食譜的「我的食譜／收藏」共用）
export function SegmentNav({ ariaLabel, items }: { ariaLabel: string; items: SegmentItem[] }) {
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex h-10 min-w-16 items-center justify-center rounded-card px-3 text-body no-underline ${
      isActive ? 'bg-surface font-bold text-ink' : 'text-ink-muted'
    }`;
  return (
    <nav aria-label={ariaLabel} className="flex h-11 shrink-0 gap-0 rounded-chef bg-photo-empty p-0.5">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={tab}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
