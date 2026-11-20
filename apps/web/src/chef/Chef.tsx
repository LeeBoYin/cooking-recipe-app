// 靈感大廚：手繪線條加平塗（17 第八節）。目前是靜態圖，表情與動畫之後用 Rive 做。
type Props = { size?: 40 | 56 | 96; className?: string };

export function Chef({ size = 56, className }: Props) {
  const height = Math.round((size * 76) / 64);
  return (
    <svg width={size} height={height} viewBox="0 0 64 76" aria-hidden="true" className={className}>
      <path
        d="M17 19c-6 0-8-6-4-10 3-3 7-2 9 0 1-5 8-7 12-4 3-3 10-2 11 3 5-1 9 5 5 9-1 1-2 2-4 2z"
        fill="#FFFFFF"
        stroke="var(--color-ink)"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M19 18.5l26 .4-.3 5.2-25.5-.3z" fill="#FFFFFF" stroke="var(--color-ink)" strokeWidth="2.6" strokeLinejoin="round" />
      <path
        d="M32 26.5c-12 .2-19.5 8.4-19 18.2.3 6.6 4.2 10.6 8.2 14.4l.2 6h21.4l.1-6c4.2-3.9 8.1-8 8.2-14.6.2-9.8-7.1-18.2-19.1-18z"
        fill="var(--color-bulb)"
        stroke="var(--color-ink)"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <circle cx="26.5" cy="43" r="2.2" fill="var(--color-ink)" />
      <circle cx="37.5" cy="43" r="2.2" fill="var(--color-ink)" />
      <path d="M27 49.5q5 3.6 10-.2" fill="none" stroke="var(--color-ink)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M22.5 67.5h19M24.5 71.5h15" stroke="var(--color-ink-muted)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
