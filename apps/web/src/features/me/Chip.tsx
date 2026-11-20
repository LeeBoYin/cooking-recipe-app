// 可以點選的小標籤（過敏、飲食原則…）；選中時加粗、黃框（17）
export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-9 rounded-full px-3 font-[inherit] text-caption text-ink ${
        selected ? 'border-2 border-bulb bg-bulb-soft font-bold' : 'border border-line bg-surface'
      }`}
    >
      {children}
    </button>
  );
}
