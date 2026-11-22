import { FormattedMessage } from 'react-intl';
import { Link } from 'react-router';
import { Icon } from '../shell/Icon.tsx';

// 食材與廚具共用的動作列：左邊「快速盤點」，右邊「編輯」與「＋ 新增…」。
// 三個都是圖示加文字、沒有外框；只有「新增」有淡淡的底色。編輯模式時「編輯」變「完成」。
export function ActionBar({
  inventoryTo, addTo, inventoryId, addId, editing, canEdit, onToggleEdit,
}: {
  inventoryTo: string;
  addTo: string;
  inventoryId: string;
  addId: string;
  editing: boolean;
  canEdit: boolean;
  onToggleEdit: () => void;
}) {
  const quiet = 'flex h-11 items-center gap-1 rounded-card border-0 bg-transparent px-2 text-caption font-bold text-ink-muted no-underline';
  return (
    <div className="flex items-center justify-between">
      {editing ? <span /> : (
        <Link to={inventoryTo} className={quiet}>
          <Icon name="zonePantry" size={18} />
          <FormattedMessage id={inventoryId} />
        </Link>
      )}
      <div className="flex items-center gap-1">
        {canEdit && (
          <button type="button" onClick={onToggleEdit} className={quiet}>
            <Icon name={editing ? 'check' : 'edit'} size={18} />
            <FormattedMessage id={editing ? 'kitchen.list.editDone' : 'kitchen.list.edit'} />
          </button>
        )}
        {!editing && (
          <Link to={addTo} className="flex h-11 items-center gap-1 rounded-card bg-bulb-soft px-3 text-caption font-bold text-ink no-underline">
            <Icon name="plus" size={18} />
            <FormattedMessage id={addId} />
          </Link>
        )}
      </div>
    </div>
  );
}
