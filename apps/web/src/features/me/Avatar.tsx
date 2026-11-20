import { usePhotoUrls } from '../../data/hooks.ts';
import type { Photo } from '../../data/photos.ts';

// 圓形大頭貼；還沒有照片時顯示暱稱的第一個字
export function Avatar({ photo, name, size = 72 }: { photo?: Photo | null; name: string; size?: number }) {
  const urls = usePhotoUrls(photo ? [photo.thumb_path] : []);
  const url = photo ? urls.data?.[photo.thumb_path] : undefined;
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-line-strong font-bold text-ink"
    >
      {url ? <img src={url} alt="" className="size-full object-cover" /> : Array.from(name)[0]}
    </span>
  );
}
