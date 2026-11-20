import { useEffect } from 'react';
import { useIntl } from 'react-intl';
import { usePhotoUrls } from '../../data/hooks.ts';
import { Icon } from '../shell/Icon.tsx';

export type ViewerPhoto = { id: string; path: string }; // path：原圖（storage_path）

// 點開看原圖：全螢幕、不裁切。多張時可以上一張／下一張。
export function PhotoViewer({ photos, index, onIndex, onClose }: {
  photos: ViewerPhoto[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const intl = useIntl();
  const current = photos[index];
  const urls = usePhotoUrls(current ? [current.path] : []).data;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < photos.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onClose, onIndex]);

  if (!current) return null;
  const nav = 'absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-surface/90 text-ink';
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex items-center justify-center bg-ink/95">
      {urls?.[current.path] && <img src={urls[current.path]} alt="" className="max-h-full max-w-full object-contain" />}
      <button
        type="button"
        autoFocus
        onClick={onClose}
        aria-label={intl.formatMessage({ id: 'recipe.viewer.close' })}
        className="absolute top-[calc(12px+env(safe-area-inset-top))] right-3 flex size-11 items-center justify-center rounded-full border-0 bg-surface/90 text-ink"
      >
        <Icon name="close" />
      </button>
      {index > 0 && (
        <button type="button" onClick={() => onIndex(index - 1)} aria-label={intl.formatMessage({ id: 'recipe.viewer.prev' })} className={`${nav} left-3`}>
          <Icon name="back" />
        </button>
      )}
      {index < photos.length - 1 && (
        <button type="button" onClick={() => onIndex(index + 1)} aria-label={intl.formatMessage({ id: 'recipe.viewer.next' })} className={`${nav} right-3`}>
          <Icon name="right" />
        </button>
      )}
    </div>
  );
}
