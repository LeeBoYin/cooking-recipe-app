import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate, useParams } from 'react-router';
import { useCurrentKitchen, usePantryItems, useRemovePantryItem, useUpdatePantryItem } from '../../data/hooks.ts';
import type { PantryItem } from '../../data/pantry.ts';
import { SubPage } from '../shell/SubPage.tsx';
import { todayIn } from './dates.ts';
import { ExpiryFields, type Expiry } from './ExpiryFields.tsx';
import { displayName } from './labels.ts';
import { ZoneSelect } from './ZoneSelect.tsx';
import { ItemIcon } from '../../icons/ItemIcon.tsx';

function Form({ item, today, kitchenId }: { item: PantryItem; today: string; kitchenId: string }) {
  const intl = useIntl();
  const navigate = useNavigate();
  const update = useUpdatePantryItem(kitchenId);
  const remove = useRemovePantryItem(kitchenId);
  const [zone, setZone] = useState(item.zone);
  const [soon, setSoon] = useState(item.want_to_use_soon);
  const [expiry, setExpiry] = useState<Expiry>({ expires_at: item.expires_at, date_type: item.date_type });
  const [note, setNote] = useState(item.note ?? '');
  const name = displayName(item);

  async function save() {
    try {
      await update.mutateAsync({
        id: item.id,
        patch: { zone, want_to_use_soon: soon, expires_at: expiry.expires_at, date_type: expiry.date_type, note: note.trim() || null },
      });
      void navigate(-1);
    } catch {
      // 錯誤訊息由下方 update.isError 顯示
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <h2 className="m-0 font-round text-heading font-bold">
        <ItemIcon kind="ingredient" id={item.ingredient_id} size={32} /> {name}
      </h2>
      <ZoneSelect value={zone} onChange={setZone} />
      <label className="flex min-h-11 items-center gap-2 text-body">
        <input type="checkbox" checked={soon} onChange={(e) => setSoon(e.target.checked)} className="size-5 accent-bulb" />
        <FormattedMessage id="pantry.useSoon" />
      </label>
      <details open={!!item.expires_at || !!item.note}>
        <summary className="min-h-11 cursor-pointer text-caption font-bold leading-[44px]">
          <FormattedMessage id="pantry.moreOptions" />
        </summary>
        <div className="flex flex-col gap-3">
          <ExpiryFields value={expiry} today={today} onChange={setExpiry} />
          <label className="flex flex-col gap-1">
            <span className="text-caption font-bold"><FormattedMessage id="pantry.note" /></span>
            <input
              type="text"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-12 rounded-card border border-line bg-surface px-3 text-body text-ink"
            />
          </label>
        </div>
      </details>
      <button
        type="button"
        disabled={remove.isPending}
        onClick={() => remove.mutate(item.id, { onSuccess: () => void navigate(-1) })}
        className="min-h-11 self-start border-0 bg-transparent px-0 text-caption font-bold text-ink underline underline-offset-4"
      >
        <FormattedMessage id="pantry.remove" />
      </button>
      {(update.isError || remove.isError) && (
        <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="pantry.error.write" /></p>
      )}
      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[560px] bg-bg px-4 pt-2 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={update.isPending}
          onClick={() => void save()}
          className="h-12 w-full rounded-card border-0 bg-bulb text-body font-bold text-ink disabled:opacity-50"
        >
          {intl.formatMessage({ id: update.isPending ? 'pantry.saving' : 'pantry.save' })}
        </button>
      </div>
    </div>
  );
}

// 編輯一樣食材：放哪裡、想先用掉、期限、備註，或移除
export function EditPage() {
  const intl = useIntl();
  const { id } = useParams();
  const { kitchen } = useCurrentKitchen();
  const pantry = usePantryItems(kitchen?.id);
  const item = pantry.data?.find((i) => i.id === id);
  return (
    <SubPage srTitle={intl.formatMessage({ id: 'pantry.edit' })}>
      {pantry.isPending ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>
      ) : !item || !kitchen ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="pantry.notFound" /></p>
      ) : (
        <Form item={item} kitchenId={kitchen.id} today={todayIn(kitchen.timezone)} />
      )}
    </SubPage>
  );
}
