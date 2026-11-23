import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';
import { Icon } from '../shell/Icon.tsx';

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

// 食材列、步驟共用的上下拖拉排序：只有左邊的把手能拖（手指按住把手就拖，不會和捲動打架），也能用鍵盤
export function SortableList({ ids, onReorder, children }: { ids: string[]; onReorder: (activeId: string, overId: string) => void; children: ReactNode }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd(e: DragEndEvent) {
    if (e.over && e.active.id !== e.over.id) onReorder(String(e.active.id), String(e.over.id));
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalOnly]} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function SortableItem({ id, handleLabel, className, handleContent, handleClassName, children }: {
  id: string;
  handleLabel: string;
  className?: string;
  // 預設是一個拖拉圖示；步驟列放「號碼加圖示」整塊
  handleContent?: ReactNode;
  handleClassName?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${className ?? ''} ${isDragging ? 'relative z-10 rounded-card bg-surface shadow-[0_2px_12px_rgba(43,38,34,0.18)]' : ''}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={handleLabel}
        {...attributes}
        {...listeners}
        style={{ touchAction: 'none' }}
        className={handleClassName ?? 'flex size-11 shrink-0 cursor-grab items-center justify-center border-0 bg-transparent p-0 text-ink-muted'}
      >
        {handleContent ?? <Icon name="grip" size={20} />}
      </button>
      {children}
    </div>
  );
}
