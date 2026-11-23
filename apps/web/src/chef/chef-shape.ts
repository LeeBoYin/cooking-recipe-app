// 大廚的造型只維護這一份（17 第八節）：Chef.tsx、啟動畫面（index.html）和 App icon 都從這裡來。
// 只放資料與字串，不放 React，讓 scripts/chef-assets.ts 也能直接讀。
export type ChefMood = 'normal' | 'happy' | 'idea' | 'quiet' | 'surprised' | 'thinking';

// 上方多留 4 單位：驚喜時帽子彈起來不會被切到
export const CHEF_VIEWBOX = { x: 0, y: -4, width: 64, height: 80 };

export const BULB_PATH =
  'M32 26.5c-12 .2-19.5 8.4-19 18.2.3 6.6 4.2 10.6 8.2 14.4l.2 6h21.4l.1-6c4.2-3.9 8.1-8 8.2-14.6.2-9.8-7.1-18.2-19.1-18z';
export const HAT_CROWN_PATH =
  'M22 26C14 26 11 18 16 13.5C19 11 22.5 11.5 24.5 13.5C25.5 7 33 5 37 9.5C40.5 6.5 47 8 47.5 13.5C52 14 53 21.5 46 26Z';
export const HAT_BRIM_PATH = 'M20 26Q32 21.5 44 26L44 32Q32 27 20 32Z';
export const STAND_PATH = 'M22.5 67.5h19M24.5 71.5h15';

// 帽子沿著頭頂滑動：以燈泡圓心為中心旋轉
export const BULB_CENTER = { x: 32, y: 44.5 };

// 帽子的姿勢（角度為度數、dy 為往下的單位）；驚喜時帽子彈起來，是唯一離開頭的表情
export const HAT_POSE: Record<ChefMood, { angle: number; dy: number }> = {
  normal: { angle: -6, dy: 0 },
  happy: { angle: -11, dy: 0 },
  idea: { angle: 0, dy: 0 },
  thinking: { angle: 9, dy: 0 },
  quiet: { angle: -15, dy: 1 },
  surprised: { angle: -4, dy: -7 },
};

export function hatTransform(mood: ChefMood): string {
  const { angle, dy } = HAT_POSE[mood];
  const { x, y } = BULB_CENTER;
  return `translate(0 ${dy}) rotate(${angle} ${x} ${y})`;
}

// 驚喜時頭頂兩側的動態線
export const SURPRISE_LINES_PATH = 'M12 22l-4-4M52 22l4-4';

// 平常的表情（啟動畫面與 icon 用）
export const NORMAL_FACE = {
  eyes: [
    { cx: 26.5, cy: 43, r: 2.2 },
    { cx: 37.5, cy: 43, r: 2.2 },
  ],
  mouth: 'M27 49.5q5 3.6 10-.2',
  mouthWidth: 2.4,
};

export const CHEF_COLORS = { ink: '#2B2622', inkMuted: '#6E655C', bulb: '#F2B705', bulbSoft: '#FFF1C2', white: '#FFFFFF' };

export type ChefSvgOptions = { withStand?: boolean };

// 平常表情的大廚，組成 SVG 內容字串（不含外層 <svg>），顏色用實際色碼
export function normalChefSvgInner({ withStand = true }: ChefSvgOptions = {}): string {
  const c = CHEF_COLORS;
  const line = `stroke="${c.ink}" stroke-width="2.6" stroke-linejoin="round"`;
  const eyes = NORMAL_FACE.eyes.map((e) => `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" fill="${c.ink}"/>`).join('');
  return [
    `<path d="${BULB_PATH}" fill="${c.bulb}" ${line}/>`,
    eyes,
    `<path d="${NORMAL_FACE.mouth}" fill="none" stroke="${c.ink}" stroke-width="${NORMAL_FACE.mouthWidth}" stroke-linecap="round"/>`,
    withStand ? `<path d="${STAND_PATH}" stroke="${c.inkMuted}" stroke-width="3" stroke-linecap="round"/>` : '',
    `<g transform="${hatTransform('normal')}">`,
    `<path d="${HAT_CROWN_PATH}" fill="${c.white}" ${line}/>`,
    `<path d="${HAT_BRIM_PATH}" fill="${c.white}" ${line}/>`,
    `</g>`,
  ].join('');
}
