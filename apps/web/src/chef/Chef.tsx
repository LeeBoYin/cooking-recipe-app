// 靈感大廚：手繪線條加平塗（17 第八節）。目前是佔位的靜態圖：用燈泡顏色、眼睛和嘴形分幾種表情；
// 正式插圖與動畫（Rive）完成後，只換這個元件，其他畫面不用動。
import {
  BULB_PATH,
  CHEF_VIEWBOX,
  HAT_BRIM_PATH,
  HAT_CROWN_PATH,
  STAND_PATH,
  SURPRISE_LINES_PATH,
  hatTransform,
  type ChefMood,
} from './chef-shape.ts';

export type { ChefMood };
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
  const { x, y, width, height: vbHeight } = CHEF_VIEWBOX;
  const height = Math.round((size * vbHeight) / width);
  const line = { stroke: INK, strokeWidth: 2.6, strokeLinejoin: 'round' as const };
  return (
    <svg
      width={size}
      height={height}
      viewBox={`${x} ${y} ${width} ${vbHeight}`}
      aria-hidden="true"
      className={className}
      data-mood={mood}
    >
      <path d={BULB_PATH} fill={BULB[mood]} className={blink ? 'chef-bulb-blink' : undefined} {...line} />
      <Face mood={mood} />
      <path d={STAND_PATH} stroke="var(--color-ink-muted)" strokeWidth="3" strokeLinecap="round" />
      {mood === 'surprised' ? (
        <path d={SURPRISE_LINES_PATH} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      ) : null}
      <g transform={hatTransform(mood)}>
        <path d={HAT_CROWN_PATH} fill="#FFFFFF" {...line} />
        <path d={HAT_BRIM_PATH} fill="#FFFFFF" {...line} />
      </g>
    </svg>
  );
}
