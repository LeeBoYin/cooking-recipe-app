// 安裝到主畫面（12 ②）。Android 的 Chrome 會觸發 beforeinstallprompt，要在 App 一開始就接住，
// 之後新手引導才能在適當的時候叫出系統的安裝提示。iPhone 的 Safari 沒有這個事件，只能用圖文教學。
type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string };
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<InstallChoice> };

let deferred: BeforeInstallPromptEvent | null = null;

export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
  });
}

// 已經從主畫面打開（standalone）
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export type InstallMode = 'ios' | 'prompt' | null;

// null：這一步用不到（電腦、已經從主畫面打開、或瀏覽器不支援安裝提示）
export function installMode(): InstallMode {
  if (isStandalone()) return null;
  if (isIos()) return 'ios';
  return deferred ? 'prompt' : null;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome === 'accepted';
}
