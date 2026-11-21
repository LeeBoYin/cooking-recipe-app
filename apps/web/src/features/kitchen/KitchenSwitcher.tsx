import { useEffect } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useMyKitchens, useSetCurrentKitchen } from '../../data/hooks.ts';
import { Icon } from '../shell/Icon.tsx';
import { useToast } from '../shell/Toast.tsx';

// 切換廚房：從底部彈出，列出我所在的所有廚房。
// M0 只有切換；成員、設定、建立與加入廚房從 M2 起加在清單下面（02 多個廚房）。
export function KitchenSwitcher({ currentId, onClose }: { currentId: string | undefined; onClose: () => void }) {
  const intl = useIntl();
  const kitchens = useMyKitchens();
  const switchTo = useSetCurrentKitchen();
  const toast = useToast();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function pick(id: string, name: string) {
    if (id === currentId) return onClose();
    switchTo.mutate(id, {
      onSuccess: () => {
        onClose();
        toast(intl.formatMessage({ id: 'kitchen.switch.done' }, { name }));
      },
    });
  }

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        aria-label={intl.formatMessage({ id: 'kitchen.switch.close' })}
        onClick={onClose}
        className="absolute inset-0 border-0 bg-ink/45"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={intl.formatMessage({ id: 'kitchen.switch.title' })}
        className="absolute inset-x-0 bottom-0 mx-auto flex max-w-[560px] flex-col gap-1 rounded-t-[16px] bg-surface px-4 pt-2 pb-[calc(28px+env(safe-area-inset-bottom))]"
      >
        <span aria-hidden="true" className="mb-2 h-1 w-10 self-center rounded-full bg-line-strong" />
        <h2 className="mx-3 mt-0 mb-1 font-round text-card-title">
          <FormattedMessage id="kitchen.switch.title" />
        </h2>
        {kitchens.isPending && <p className="m-3 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>}
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {(kitchens.data ?? []).map((k) => {
            const on = k.id === currentId;
            return (
              <li key={k.id}>
                <button
                  type="button"
                  aria-current={on ? 'true' : undefined}
                  disabled={switchTo.isPending}
                  onClick={() => pick(k.id, k.name)}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-card border-0 px-3 text-left text-body text-ink ${
                    on ? 'bg-bulb-soft font-bold' : 'bg-transparent'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{k.name}</span>
                  {on && <Icon name="check" size={20} />}
                </button>
              </li>
            );
          })}
        </ul>
        {switchTo.isError && (
          <p role="alert" className="m-3 text-caption text-error"><FormattedMessage id="kitchen.switch.error" /></p>
        )}
      </div>
    </div>
  );
}
