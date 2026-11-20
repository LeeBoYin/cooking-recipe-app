import { useEffect, useRef } from 'react';
import { FormattedMessage } from 'react-intl';
import {
  useCurrentKitchen,
  useDeletePhoto,
  useEquipmentPhotos,
  usePhotoUrls,
  useSetEquipmentPhoto,
  useUploadState,
} from '../../data/hooks.ts';
import { preloadWebpEncoder } from '../../photos/encode.ts';

// 編輯廚具時的照片：看、換、移除。選好之後在手機端壓縮，背景上傳；
// 上傳還沒完成時顯示進度，失敗會保留、下次打開或網路恢復時自動續傳（04 ADR-06）
export function EquipmentPhoto({ equipmentId }: { equipmentId: string }) {
  const { kitchen } = useCurrentKitchen();
  const photos = useEquipmentPhotos(kitchen?.id);
  const photo = photos.data?.get(equipmentId);
  const urls = usePhotoUrls(photo ? [photo.feed_path] : []);
  const set = useSetEquipmentPhoto(kitchen?.id);
  const remove = useDeletePhoto(kitchen?.id);
  const uploads = useUploadState();
  const input = useRef<HTMLInputElement>(null);
  const upload = [...uploads.values()].find((u) => u.equipmentId === equipmentId);

  // 打開編輯頁時先預載 WebP 轉檔程式（iPhone 的 Safari 才需要）
  useEffect(() => {
    void preloadWebpEncoder().catch(() => undefined);
  }, []);

  const url = photo ? urls.data?.[photo.feed_path] : undefined;
  const busy = set.isPending || (!!upload && !upload.failed);

  return (
    <section className="flex flex-col gap-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-card bg-line-soft">
        {url && <img src={url} alt="" width={photo?.width} height={photo?.height} className="size-full object-cover" />}
        {busy && (
          <div role="status" className="absolute inset-0 flex items-center justify-center bg-ink/40 text-body font-bold text-surface">
            <FormattedMessage
              id="equipment.photo.uploading"
              values={{ done: set.isPending ? 0 : (upload?.done ?? 0), total: upload?.total ?? 4 }}
            />
          </div>
        )}
      </div>

      {upload?.failed && (
        <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="equipment.photo.retry" /></p>
      )}
      {(set.isError || remove.isError) && (
        <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="equipment.photo.error" /></p>
      )}

      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) set.mutate({ equipmentId, file });
        }}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="h-12 flex-1 rounded-card border border-line bg-surface text-body text-ink disabled:opacity-50"
        >
          <FormattedMessage id={photo ? 'equipment.photo.replace' : 'equipment.photo.add'} />
        </button>
        {photo && (
          <button
            type="button"
            disabled={busy || remove.isPending}
            onClick={() => remove.mutate(photo)}
            className="h-12 rounded-card border border-line bg-surface px-4 text-body text-error disabled:opacity-50"
          >
            <FormattedMessage id="equipment.photo.remove" />
          </button>
        )}
      </div>
    </section>
  );
}
