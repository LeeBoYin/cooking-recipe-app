// 輸出 WebP。瀏覽器能直接輸出的（Chrome、Android）用內建的；
// 不能的（iPhone 的 Safari，canvas 會退回 PNG）改用 WebAssembly 的 @jsquash/webp，只在需要時才下載。
const QUALITY = 0.8;

let nativeSupport: Promise<boolean> | undefined;

function supportsNativeWebp(): Promise<boolean> {
  nativeSupport ??= new Promise<boolean>((resolve) => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      c.toBlob((b) => resolve(b?.type === 'image/webp'), 'image/webp', QUALITY);
    } catch {
      resolve(false);
    }
  });
  return nativeSupport;
}

async function wasmEncode() {
  const mod = await import('@jsquash/webp/encode.js');
  return mod.default;
}

// 打開有照片的編輯頁時先呼叫，第一次轉檔就不用等下載與初始化（約 1 秒）
export async function preloadWebpEncoder(): Promise<void> {
  if (!(await supportsNativeWebp())) await wasmEncode();
}

export async function encodeWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  if (await supportsNativeWebp()) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY));
    if (blob?.type === 'image/webp') return blob;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  const encode = await wasmEncode();
  const buffer = await encode(ctx.getImageData(0, 0, canvas.width, canvas.height), { quality: QUALITY * 100 });
  return new Blob([buffer], { type: 'image/webp' });
}
