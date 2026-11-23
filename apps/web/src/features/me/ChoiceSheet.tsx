import { useState, type ReactNode } from 'react';
import { FormattedMessage } from 'react-intl';
import { Sheet } from '../../ui/Sheet.tsx';

export type Choice = { id: string; label: string };

// 從下方滑出的面板外框（可拖曳關閉，見 ui/Sheet）：標題加內容
export function SheetFrame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode | ((requestClose: () => void) => ReactNode) }) {
  return (
    <Sheet label={title} onClose={onClose}>
      {(requestClose) => (
        <>
          <b className="text-[20px]">{title}</b>
          {typeof children === 'function' ? children(requestClose) : children}
        </>
      )}
    </Sheet>
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
      {(requestClose) => (
        <>
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
          if (!selected) return;
          onPick(selected);
          requestClose();
        }}
        className="h-12 rounded-card border-2 border-ink bg-bulb font-[inherit] text-body font-bold text-ink disabled:opacity-50"
      >
        <FormattedMessage id="common.ok" />
      </button>
        </>
      )}
    </SheetFrame>
  );
}
