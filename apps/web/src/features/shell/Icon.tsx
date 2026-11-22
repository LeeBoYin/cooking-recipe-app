// 圓頭線條圖示（24px、2px 線寬），M0 先佔位，之後和手繪版一次替換（17 第七節）。
const PATHS = {
  home: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-6h4v6',
  recipes: 'M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM9 9h6M9 13h6',
  plus: 'M12 5v14M5 12h14',
  kitchen: 'M4 10h16v3a6 6 0 01-6 6h-4a6 6 0 01-6-6v-3zM8 10V8a4 4 0 018 0v2M20 12h2',
  me: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  back: 'M15 5l-7 7 7 7',
  // gear、clock、bulb 取自 Lucide（ISC 授權，https://lucide.dev），線寬與其他圖示一致
  gear: 'M9.671 4.136a2.34 2.34 0 014.659 0 2.34 2.34 0 003.319 1.915 2.34 2.34 0 012.33 4.033 2.34 2.34 0 000 3.831 2.34 2.34 0 01-2.33 4.033 2.34 2.34 0 00-3.319 1.915 2.34 2.34 0 01-4.659 0 2.34 2.34 0 00-3.32-1.915 2.34 2.34 0 01-2.33-4.033 2.34 2.34 0 000-3.831A2.34 2.34 0 016.35 6.051a2.34 2.34 0 003.319-1.915M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  clock: 'M22 12a10 10 0 11-20 0 10 10 0 0120 0zM12 6v6l4 2',
  bulb: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4',
  share: 'M12 15V4M8 7.5L12 4l4 3.5M6 11H5v9h14v-9h-1',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  close: 'M6 6l12 12M18 6L6 18',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  trash: 'M5 7h14M10 4h4M7 7l1 13h8l1-13M10 11v6M14 11v6',
  check: 'M5 12.5l4.5 4.5L19 7',
  down: 'M6 9l6 6 6-6',
  right: 'M9 6l6 6-6 6',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  retry: 'M19 8a7.5 7.5 0 10 1 6M20 3.5V8h-4.5',
  people: 'M9 11.5a3 3 0 100-6 3 3 0 000 6zM3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M16.5 12a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8zM16.5 14.2c2.2 0 3.7 1.5 4.1 4.3',
  book: 'M12 6c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-13c-3-.5-6 0-8 1.5zM12 6v13',
  house: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 14h4v2h-4z',
  zoneSeasoning: 'M7 6h10v3H7zM8 9v10a1 1 0 001 1h6a1 1 0 001-1V9M10 14h4',
  zoneFridge: 'M7 3h10a1 1 0 011 1v16a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM6 10h12M9 6.5v1.5M9 13v3',
  zoneFreezer: 'M6 5h12a1 1 0 011 1v12a1 1 0 01-1 1H6a1 1 0 01-1-1V6a1 1 0 011-1zM8.5 9.5l2-2M8.5 13l5-5',
  zonePantry: 'M5 4h14v16H5zM12 4v16M10 11v2M14 11v2',
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
