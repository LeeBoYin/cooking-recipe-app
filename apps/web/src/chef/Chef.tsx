// 靈感大廚：手繪線條加平塗（17 第八節）。目前是佔位的靜態圖：用燈泡顏色、眼睛和嘴形分幾種表情；
// 正式插圖與動畫（Rive）完成後，只換這個元件，其他畫面不用動。
export type ChefMood = 'normal' | 'happy' | 'idea' | 'quiet' | 'surprised' | 'thinking';
export type ChefSize = 24 | 40 | 56 | 96;
// blink：燈泡一明一滅（思考中用；手機開了「減少動態」就不閃，見 styles.css）
type Props = { size?: ChefSize; mood?: ChefMood; blink?: boolean; className?: string };

// 燈泡顏色（17 第八節）：平常、想到點子最亮、安慰柔和暖光
const BULB: Record<ChefMood, string> = {
  normal: 'var(--color-bulb)',
  happy: 'var(--color-bulb)',
  idea: '#FFD84D',
  quiet: '#F3C58C',
  surprised: '#FFD84D',
  thinking: '#F7DFA0',
};

const INK = 'var(--color-ink)';

function Face({ mood }: { mood: ChefMood }) {
  const stroke = { fill: 'none', stroke: INK, strokeWidth: 2.4, strokeLinecap: 'round' as const };
  switch (mood) {
    case 'happy':
      return (
        <>
          <path d="M23.5 43.5q3-3.4 6 0M34.5 43.5q3-3.4 6 0" {...stroke} />
          <path d="M26 48.5q6 6.5 12 0z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        </>
      );
    case 'idea':
      return (
        <>
          <circle cx="26.5" cy="42.5" r="2.4" fill={INK} />
          <circle cx="37.5" cy="42.5" r="2.4" fill={INK} />
          <path d="M26.5 48.5q5.5 6.5 11 0z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 36l-4-2M9 28l-4-4M56 36l4-2M55 28l4-4" {...stroke} strokeWidth={2} />
        </>
      );
    case 'thinking':
      return (
        <>
          <circle cx="26.5" cy="42.5" r="2.4" fill={INK} />
          <circle cx="37.5" cy="42.5" r="2.4" fill={INK} />
          <path d="M28 50h8" {...stroke} />
        </>
      );
    case 'quiet':
      return (
        <>
          <path d="M23.5 43.5q3 2.6 6 0M34.5 43.5q3 2.6 6 0" {...stroke} />
          <path d="M28 50q4 2.4 8 0" {...stroke} />
        </>
      );
    case 'surprised':
      return (
        <>
          <circle cx="26.5" cy="42.5" r="3.2" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
          <circle cx="37.5" cy="42.5" r="3.2" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
          <circle cx="26.5" cy="42.5" r="1.2" fill={INK} />
          <circle cx="37.5" cy="42.5" r="1.2" fill={INK} />
          <ellipse cx="32" cy="51" rx="2.8" ry="3.4" fill={INK} />
        </>
      );
    default:
      return (
        <>
          <circle cx="26.5" cy="43" r="2.2" fill={INK} />
          <circle cx="37.5" cy="43" r="2.2" fill={INK} />
          <path d="M27 49.5q5 3.6 10-.2" {...stroke} />
        </>
      );
  }
}

export function Chef({ size = 56, mood = 'normal', blink = false, className }: Props) {
  const height = Math.round((size * 76) / 64);
  return (
    <svg width={size} height={height} viewBox="0 0 64 76" aria-hidden="true" className={className} data-mood={mood}>
      <path
        d="M17 19c-6 0-8-6-4-10 3-3 7-2 9 0 1-5 8-7 12-4 3-3 10-2 11 3 5-1 9 5 5 9-1 1-2 2-4 2z"
        fill="#FFFFFF"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M19 18.5l26 .4-.3 5.2-25.5-.3z" fill="#FFFFFF" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path
        d="M32 26.5c-12 .2-19.5 8.4-19 18.2.3 6.6 4.2 10.6 8.2 14.4l.2 6h21.4l.1-6c4.2-3.9 8.1-8 8.2-14.6.2-9.8-7.1-18.2-19.1-18z"
        fill={BULB[mood]}
        className={blink ? 'chef-bulb-blink' : undefined}
        stroke={INK}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <Face mood={mood} />
      <path d="M22.5 67.5h19M24.5 71.5h15" stroke="var(--color-ink-muted)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
