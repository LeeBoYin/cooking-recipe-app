import { useState, type ReactNode } from 'react';
import { FormattedMessage } from 'react-intl';

export type Choice = { id: string; label: string };

// 從下方滑出的面板外框：點外面關閉，內容自己放
export function SheetFrame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/45" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex w-full max-w-[560px] flex-col gap-3 rounded-t-2xl bg-bg px-5 pt-2.5 pb-[calc(28px+env(safe-area-inset-bottom))]"
      >
        <span aria-hidden="true" className="h-[5px] w-10 self-center rounded-sm bg-line-strong" />
        <b className="text-[20px]">{title}</b>
        {children}
      </div>
    </div>
  );
}

// 從下方滑出的單選面板（口味地圖「改一項」）：選一個，按「好」才存
export function ChoiceSheet({
  title,
  choices,
  value,
  note,
  onPick,
  onClose,
}: {
  title: string;
  choices: readonly Choice[];
  value: string | undefined;
  note?: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(value);
  return (
    <SheetFrame title={title} onClose={onClose}>
      <div role="radiogroup" aria-label={title} className="flex flex-col gap-3">
        {choices.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={selected === c.id}
            onClick={() => setSelected(c.id)}
            className={`h-12 rounded-card font-[inherit] text-body text-ink ${
              selected === c.id ? 'border-2 border-bulb bg-bulb-soft font-bold' : 'border border-line bg-surface'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {note && <p className="m-0 text-small leading-normal text-ink-muted">{note}</p>}
      <button
        type="button"
        disabled={!selected}
        onClick={() => {
          if (selected) onPick(selected);
        }}
        className="h-12 rounded-card border-2 border-ink bg-bulb font-[inherit] text-body font-bold text-ink disabled:opacity-50"
      >
        <FormattedMessage id="common.ok" />
      </button>
    </SheetFrame>
  );
}
