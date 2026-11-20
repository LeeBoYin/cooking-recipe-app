import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useAvatar, useMyIdentity, useSetAvatar, useUpdateDisplayName } from '../../data/hooks.ts';
import { preloadWebpEncoder } from '../../photos/encode.ts';
import { Icon } from '../shell/Icon.tsx';
import { Avatar } from './Avatar.tsx';
import { AvatarCropper } from './AvatarCropper.tsx';

const NAME_MAX = 20;
const nameLength = (s: string) => Array.from(s.trim()).length;

// 「我的」頁（02 M0 的「我的」）。M0-16a 先放頭像與暱稱；口味地圖、飲食限制、設定等接在下面（M0-16b）
export function MePage() {
  const intl = useIntl();
  const identity = useMyIdentity();
  const avatar = useAvatar(identity.data?.user_id);
  const setAvatar = useSetAvatar();
  const rename = useUpdateDisplayName();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  // 打開頁面時先預載 WebP 轉檔程式（iPhone 的 Safari 才需要）
  useEffect(() => {
    void preloadWebpEncoder().catch(() => undefined);
  }, []);

  if (identity.isError) {
    return <p role="alert" className="text-caption text-error"><FormattedMessage id="me.loadError" /></p>;
  }
  if (!identity.data) {
    return <p className="text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>;
  }
  const name = identity.data.display_name;
  const valid = nameLength(draft) >= 1 && nameLength(draft) <= NAME_MAX;

  const startEdit = () => {
    setDraft(name);
    rename.reset();
    setEditing(true);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    rename.mutate(draft, { onSuccess: () => setEditing(false) });
  };

  return (
    <section className="flex flex-col gap-3.5">
      <h1 className="sr-only"><FormattedMessage id="tab.me" /></h1>
      <div className="flex items-center gap-3.5">
        <button
          type="button"
          aria-label={intl.formatMessage({ id: 'me.avatar.change' })}
          disabled={setAvatar.isPending}
          onClick={() => input.current?.click()}
          className="relative size-[72px] shrink-0 rounded-full border-0 bg-transparent p-0 disabled:opacity-60"
        >
          <Avatar photo={avatar.data} name={name} />
          <span className="absolute -bottom-0.5 -right-0.5 grid size-7 place-items-center rounded-full border-2 border-bg bg-bulb text-ink">
            <Icon name="camera" size={16} />
          </span>
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) setPicked(file);
          }}
        />

        {editing ? (
          <form onSubmit={submit} className="flex flex-1 flex-col gap-1">
            <label className="sr-only" htmlFor="display-name"><FormattedMessage id="me.name.label" /></label>
            <input
              id="display-name"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              aria-describedby="display-name-hint"
              className="h-11 w-full rounded-card border border-line bg-surface px-3 text-body text-ink"
            />
            <p id="display-name-hint" className="m-0 text-small text-ink-muted">
              <FormattedMessage id="me.name.hint" values={{ max: NAME_MAX }} />
            </p>
            {rename.isError && (
              <p role="alert" className="m-0 text-small text-error"><FormattedMessage id="me.name.error" /></p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!valid || rename.isPending}
                className="h-11 flex-1 rounded-card border-0 bg-bulb text-body font-bold text-ink disabled:opacity-50"
              >
                <FormattedMessage id="common.save" />
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-11 flex-1 rounded-card border border-line bg-surface text-body text-ink"
              >
                <FormattedMessage id="common.cancel" />
              </button>
            </div>
          </form>
        ) : (
          <>
            <b className="min-w-0 flex-1 break-words text-[20px]">{name}</b>
            <button
              type="button"
              aria-label={intl.formatMessage({ id: 'me.name.edit' })}
              onClick={startEdit}
              className="grid size-11 place-items-center border-0 bg-transparent text-ink"
            >
              <Icon name="edit" size={20} />
            </button>
          </>
        )}
      </div>

      {setAvatar.isError && (
        <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="me.avatar.error" /></p>
      )}

      {picked && (
        <AvatarCropper
          file={picked}
          onCancel={() => setPicked(null)}
          onDone={(blob) => {
            setPicked(null);
            setAvatar.mutate(blob);
          }}
        />
      )}
    </section>
  );
}
