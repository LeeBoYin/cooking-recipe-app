// 圓頭線條圖示（24px、2px 線寬），M0 先佔位，之後和手繪版一次替換（17 第七節）。
const PATHS = {
  home: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-6h4v6',
  recipes: 'M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM9 9h6M9 13h6',
  plus: 'M12 5v14M5 12h14',
  kitchen: 'M4 10h16v3a6 6 0 01-6 6h-4a6 6 0 01-6-6v-3zM8 10V8a4 4 0 018 0v2M20 12h2',
  me: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0',
  back: 'M15 5l-7 7 7 7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
