import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRef } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { recipeLimits } from '../../data/recipes.ts';
import { Icon } from '../shell/Icon.tsx';
import type { EditorPhoto } from './model.ts';
import type { PhotoStatus } from './useRecipeEditor.ts';

type Props = {
  photos: EditorPhoto[];
  urlFor: (photo: EditorPhoto) => string | undefined;
  statusOf: (id: string) => PhotoStatus;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onRetry: () => void;
};

const TILE = 'relative size-[84px] shrink-0 rounded-card bg-photo-empty';

function Tile({ photo, index, url, status, onRemove, onRetry }: {
  photo: EditorPhoto;
  index: number;
  url: string | undefined;
  status: PhotoStatus;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const intl = useIntl();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, touchAction: 'manipulation' }}
      className={`${TILE} ${isDragging ? 'z-10 -translate-y-1.5 rotate-[-3deg] outline-2 outline-offset-2 outline-ink' : ''}`}
      {...attributes}
      {...listeners}
      aria-label={intl.formatMessage({ id: 'recipe.photo.alt' }, { n: index + 1 })}
    >
      {/* 不裁切：照片在格子裡置中，留白處是底色 */}
      <div className="flex size-full items-center justify-center overflow-hidden rounded-card">
        {url && <img src={url} alt="" draggable={false} className="max-h-full max-w-full object-contain" />}
      </div>
      {index === 0 && (
        <span className="absolute top-1.5 left-1.5 rounded-tag bg-ink px-1.5 py-0.5 text-small font-bold leading-none text-surface">
          <FormattedMessage id="recipe.photo.cover" />
        </span>
      )}
      {status === 'uploading' && (
        <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-card bg-ink/55 text-small font-bold text-surface">
          <FormattedMessage id="recipe.photo.uploading" />
          <span className="relative block h-1 w-14 rounded-full bg-surface/35">
            <span className="absolute inset-y-0 left-0 w-1/2 animate-pulse rounded-full bg-bulb" />
          </span>
        </div>
      )}
      {status === 'failed' && (
        <button
          type="button"
          onClick={onRetry}
          aria-label={intl.formatMessage({ id: 'recipe.photo.retryAria' })}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-card border-0 bg-ink/60 text-small font-bold text-surface"
        >
          <Icon name="retry" size={20} />
          <FormattedMessage id="recipe.photo.retry" />
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        aria-label={intl.formatMessage({ id: 'recipe.photo.remove' }, { n: index + 1 })}
        className="absolute -top-1.5 -right-1.5 flex size-11 items-center justify-center border-0 bg-transparent p-0"
      >
        <span className="flex size-6 items-center justify-center rounded-full border border-line bg-surface text-ink">
          <Icon name="close" size={12} />
        </span>
      </button>
    </div>
  );
}

// 上方的照片：長按拖曳排序，第一張是封面；× 移除（由編輯頁給「復原」）。最多 5 張，不裁切。
export function PhotoStrip({ photos, urlFor, statusOf, onAdd, onRemove, onReorder, onRetry }: Props) {
  const intl = useIntl();
  const input = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // 手指要按住一下才開始拖，平常左右滑動仍然是捲動
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const full = photos.length >= recipeLimits.photos;
  const empty = photos.length === 0;

  function onDragEnd(e: DragEndEvent) {
    if (e.over && e.active.id !== e.over.id) onReorder(String(e.active.id), String(e.over.id));
  }

  const addTile = (
    <button
      type="button"
      disabled={full}
      onClick={() => input.current?.click()}
      aria-label={intl.formatMessage({ id: 'recipe.photo.addAria' }, { max: recipeLimits.photos })}
      className={`flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-card border-[1.5px] border-dashed font-[inherit] text-ink ${
        empty ? 'size-24 gap-1 text-caption' : 'size-[84px] text-small'
      } ${full ? 'border-line-strong bg-transparent text-ink-muted' : 'border-[#b9a88f] bg-surface'}`}
    >
      <Icon name={empty ? 'camera' : 'plus'} size={empty ? 26 : 22} />
      {empty && <FormattedMessage id="recipe.photo.add" />}
      <span className={empty ? 'text-small text-ink-muted' : ''}>
        {full ? (
          <FormattedMessage id="recipe.photo.full" />
        ) : (
          <FormattedMessage id="recipe.photo.count" values={{ count: photos.length, max: recipeLimits.photos }} />
        )}
      </span>
    </button>
  );

  return (
    <div className="-mx-4 overflow-x-auto px-4 pt-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length > 0) onAdd(files);
        }}
      />
      <div className="flex w-max items-center gap-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={photos.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
            {photos.map((p, i) => (
              <Tile
                key={p.id}
                photo={p}
                index={i}
                url={urlFor(p)}
                status={statusOf(p.id)}
                onRemove={() => onRemove(p.id)}
                onRetry={onRetry}
              />
            ))}
          </SortableContext>
        </DndContext>
        {addTile}
      </div>
    </div>
  );
}
