import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import { allergens, dietaryRestrictions } from '@zhusha/ingredients';
import { signOut, useSession } from '../../data/auth.ts';
import {
  useAvatar,
  useMyDietary,
  useMyIdentity,
  useMySettings,
  useMyTasteProfile,
  useSetAvatar,
  useUpdateDisplayName,
  useUpdateSettings,
} from '../../data/hooks.ts';
import { Chef } from '../../chef/Chef.tsx';
import { preloadWebpEncoder } from '../../photos/encode.ts';
import { Icon } from '../shell/Icon.tsx';
import { Avatar } from './Avatar.tsx';
import { AvatarCropper } from './AvatarCropper.tsx';
import { cardTitleText } from '../taste/cardTitle.ts';
import { maskEmail } from './tasteMap.ts';

const ONBOARDING_HINT = 'me.onboarding_card';

function Row({ to, label, value, danger, onClick }: { to?: string; label: string; value?: string; danger?: boolean; onClick?: () => void }) {
  const cls = `flex min-h-[52px] w-full items-center gap-2 border-0 border-b border-line-soft bg-transparent px-3 text-left font-[inherit] text-body no-underline last:border-b-0 ${danger ? 'text-error' : 'text-ink'}`;
  const body = (
    <>
      <span className="flex-1">{label}</span>
      {value && <span className="text-caption text-ink-muted">{value}</span>}
      {to && <Icon name="right" size={20} className="text-ink-muted" />}
    </>
  );
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  return onClick ? <button type="button" onClick={onClick} className={cls}>{body}</button> : <div className={cls}>{body}</div>;
}

const NAME_MAX = 20;
const nameLength = (s: string) => Array.from(s.trim()).length;

// 「我的」頁（02 M0 的「我的」）：頭像與暱稱、口味地圖、飲食限制、設定、新手引導、帳號
export function MePage() {
  const intl = useIntl();
  const identity = useMyIdentity();
  const avatar = useAvatar(identity.data?.user_id);
  const setAvatar = useSetAvatar();
  const rename = useUpdateDisplayName();
  const settings = useMySettings();
  const updateSettings = useUpdateSettings();
  const taste = useMyTasteProfile();
  const diet = useMyDietary();
  const session = useSession();
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

  const cardTitle = cardTitleText(intl, taste.data?.cardTitle);
  const hardNames = [
    ...(diet.data?.allergenIds ?? []).map((id) => allergens.find((a) => a.id === id)?.name['zh-TW'] ?? id),
    ...(diet.data?.restrictionIds ?? []).map((id) => dietaryRestrictions.find((r) => r.id === id)?.name['zh-TW'] ?? id),
  ];
  const st = settings.data;
  const showOnboarding = !!st && !st.onboarding_completed_at && !st.seen_hints.includes(ONBOARDING_HINT);
  const unitsText = st
    ? intl.formatMessage({ id: 'me.units.value' }, { measure: st.measure_unit.startsWith('us') ? 'us' : 'metric', temperature: st.temperature_unit.startsWith('F') ? 'F' : 'C' })
    : undefined;

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
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <b className="break-words text-[20px]">{name}</b>
              {cardTitle && <span className="text-small text-ink-muted">{cardTitle}</span>}
            </div>
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

      {showOnboarding && (
        <div className="flex items-center gap-2.5 rounded-card bg-chef-soft py-2.5 pr-1.5 pl-3">
          <Chef size={40} />
          <Link to="/taste" className="flex-1 text-caption leading-normal text-ink no-underline">
            <FormattedMessage id="me.onboarding.card" />
          </Link>
          <button
            type="button"
            aria-label={intl.formatMessage({ id: 'me.onboarding.dismiss' })}
            onClick={() => updateSettings.mutate({ seen_hints: [...(st?.seen_hints ?? []), ONBOARDING_HINT] })}
            className="grid size-11 place-items-center border-0 bg-transparent text-ink-muted"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-card bg-surface">
        <Row to="/me/taste" label={intl.formatMessage({ id: 'me.taste' })} value={cardTitle ?? undefined} />
        <Row
          to="/me/diet"
          label={intl.formatMessage({ id: 'me.diet' })}
          value={diet.data ? (hardNames.length > 0 ? hardNames.slice(0, 2).join('、') + (hardNames.length > 2 ? '…' : '') : intl.formatMessage({ id: 'me.diet.none' })) : undefined}
        />
      </div>

      <div className="overflow-hidden rounded-card bg-surface">
        <Row to="/me/settings" label={intl.formatMessage({ id: 'me.servings' })} value={st ? intl.formatMessage({ id: 'settings.servings.value' }, { count: st.household_size }) : undefined} />
        <Row to="/me/settings" label={intl.formatMessage({ id: 'me.units' })} value={unitsText} />
        <Row to="/me/settings" label={intl.formatMessage({ id: 'me.persona' })} value={st ? intl.formatMessage({ id: `settings.persona.${st.chef_persona}` }) : undefined} />
      </div>

      <div className="overflow-hidden rounded-card bg-surface">
        <Row to="/taste" label={intl.formatMessage({ id: 'me.onboarding.redo' })} />
        <Row label={intl.formatMessage({ id: 'me.account' })} value={session?.user.email ? maskEmail(session.user.email) : undefined} />
        <Row danger label={intl.formatMessage({ id: 'signOut' })} onClick={() => void signOut()} />
      </div>

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
