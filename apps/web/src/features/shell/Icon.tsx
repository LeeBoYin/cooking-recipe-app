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
  down: 'M6 9l6 6 6-6',
  right: 'M9 6l6 6-6 6',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  retry: 'M19 8a7.5 7.5 0 10 1 6M20 3.5V8h-4.5',
  people: 'M9 11.5a3 3 0 100-6 3 3 0 000 6zM3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M16.5 12a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8zM16.5 14.2c2.2 0 3.7 1.5 4.1 4.3',
  pot: 'M4 10h16v6a3 3 0 01-3 3H7a3 3 0 01-3-3zM2 10h2M20 10h2M9 6.5c0-1 1-1.5 3-1.5s3 .5 3 1.5',
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
