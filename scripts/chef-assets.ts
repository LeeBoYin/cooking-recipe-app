// 用 apps/web/src/chef/chef-shape.ts 的造型產生：啟動畫面的 SVG（寫進 apps/web/index.html）和 App icon 的 PNG。
// 改了大廚的造型後執行 `pnpm chef:assets`；`--check` 只檢查啟動畫面有沒有跟上（CI 與測試用）。
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { CHEF_COLORS, CHEF_VIEWBOX, normalChefSvgInner } from '../apps/web/src/chef/chef-shape.ts';

const INDEX_HTML = new URL('../apps/web/index.html', import.meta.url);
const PUBLIC = new URL('../apps/web/public/', import.meta.url);

const START = '<!-- chef:start（scripts/chef-assets.ts 產生，不要手改） -->';
const END = '<!-- chef:end -->';

export function splashSvg(): string {
  const { x, y, width, height } = CHEF_VIEWBOX;
  return `<svg width="96" height="${(96 * height) / width}" viewBox="${x} ${y} ${width} ${height}">${normalChefSvgInner()}</svg>`;
}

// icon 的版面：大廚在中間偏上，燈座與燈泡底部在下緣切掉；maskable 縮進中間 80% 的安全區
// （寬度比例與裁切位置見 17 第八節）
export const ICON_LAYOUT = { widthRatio: 0.72, topUnits: 0.5, maskableScale: 0.8 };
const CHEF_VISIBLE_WIDTH = 41; // 帽子與燈泡含描邊的寬度（單位）
const CHEF_CENTER_X = 32.5;

export function iconSvg(size: number, maskable: boolean): string {
  const k = (maskable ? ICON_LAYOUT.maskableScale : 1) * ((size * ICON_LAYOUT.widthRatio) / CHEF_VISIBLE_WIDTH);
  const tx = size / 2 - CHEF_CENTER_X * k;
  const ty = maskable ? size / 2 - 31 * k : -ICON_LAYOUT.topUnits * k;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="${CHEF_COLORS.bulbSoft}"/>` +
    `<g transform="translate(${tx} ${ty}) scale(${k})">${normalChefSvgInner({ withStand: false })}</g></svg>`
  );
}

function png(svg: string, width: number): Uint8Array {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
}

function injectSplash(html: string): string {
  const a = html.indexOf(START);
  const b = html.indexOf(END);
  if (a < 0 || b < 0) throw new Error('index.html 找不到 chef 標記');
  return html.slice(0, a + START.length) + '\n      ' + splashSvg() + '\n      ' + html.slice(b);
}

const args = process.argv.slice(2);
const html = readFileSync(INDEX_HTML, 'utf8');
const next = injectSplash(html);

if (args.includes('--check')) {
  if (next !== html) {
    console.error('啟動畫面和大廚造型不一致：請執行 pnpm chef:assets');
    process.exit(1);
  }
} else {
  writeFileSync(INDEX_HTML, next);
  const out = (name: string, svg: string, w: number) => writeFileSync(new URL(name, PUBLIC), png(svg, w));
  out('icon-192.png', iconSvg(512, false), 192);
  out('icon-512.png', iconSvg(512, false), 512);
  out('apple-touch-icon.png', iconSvg(512, false), 180);
  out('icon-maskable-512.png', iconSvg(512, true), 512);
}

