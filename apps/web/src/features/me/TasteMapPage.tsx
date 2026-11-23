import { track } from '../../data/track.ts';
import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, useNavigate } from 'react-router';
import { buildCard, type TasteProfile } from '@zhusha/core';
import { allergens, dietaryRestrictions } from '@zhusha/ingredients';
import { DIMENSION_GROUPS, preferenceDimensions, type PreferenceDimension } from '@zhusha/taste';
import { useMyDietary, useMyTasteProfile, useSaveTasteProfile } from '../../data/hooks.ts';
import { Icon } from '../shell/Icon.tsx';
import { SubPage } from '../shell/SubPage.tsx';
import { cardTitleText, challengeText } from '../taste/cardTitle.ts';
import { ChoiceSheet } from './ChoiceSheet.tsx';
import {
  ADVENTURE_LEVELS,
  LEVELS,
  TIME_OPTIONS,
  adventureLevel,
  displayLevel,
  setContext,
  setDimension,
  visibleDimensions,
  type LevelId,
} from './tasteMap.ts';

type Editing = { kind: 'dim'; dim: PreferenceDimension } | { kind: 'time' } | { kind: 'adventure' };

function RowLink({ label, value, tag, strong, onClick, to }: { label: string; value?: string; tag?: boolean; strong?: boolean; onClick?: () => void; to?: string }) {
  const body = (
    <>
      <span className="flex-1">{label}</span>
      {tag && <span className="text-small text-ink-muted"><FormattedMessage id="tastemap.userSet" /></span>}
      {value &&
        (strong === undefined ? (
          <span className="text-caption text-ink-muted">{value}</span>
        ) : (
          <span className={`whitespace-nowrap rounded-tag px-2 py-0.5 text-small font-bold ${strong ? 'bg-bulb-soft text-ink' : 'bg-line-soft text-ink-muted'}`}>{value}</span>
        ))}
      <Icon name="right" size={20} className="text-ink-muted" />
    </>
  );
  const cls = 'flex min-h-12 w-full items-center gap-2 border-0 border-b border-line-soft bg-transparent px-3 text-left font-[inherit] text-[15px] text-ink no-underline last:border-b-0';
  return to ? (
    <Link to={to} className={cls}>{body}</Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{body}</button>
  );
}

// 我的口味地圖（13 第五節）：依三層列出，每項可以直接改；改了標「你設定的」。
export function TasteMapPage() {
  const intl = useIntl();
  const stored = useMyTasteProfile();
  const diet = useMyDietary();
  const save = useSaveTasteProfile();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Editing | null>(null);

  const srTitle = intl.formatMessage({ id: 'tastemap.title' });
  if (stored.isError) {
    return <SubPage srTitle={srTitle}><p role="alert" className="text-caption text-error"><FormattedMessage id="me.loadError" /></p></SubPage>;
  }
  if (!stored.data) {
    return <SubPage srTitle={srTitle}><p className="text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p></SubPage>;
  }
  const { profile, context } = stored.data;
  const card = buildCard(profile, preferenceDimensions);
  const title = cardTitleText(intl, card.titleCode);
  const challenge = challengeText(intl, card.goals);

  const levelLabel = (id: LevelId) => intl.formatMessage({ id: `tastemap.level.${id}` });
  const apply = (next: TasteProfile) => {
    track('settings.changed', { key: 'taste_map' });
    save.mutate({ profile: next, cardTitle: buildCard(next, preferenceDimensions).titleCode ?? null, previousContext: context });
  };

  const hardNames = [
    ...(diet.data?.allergenIds ?? []).map((id) => allergens.find((a) => a.id === id)?.name['zh-TW'] ?? id),
    ...(diet.data?.restrictionIds ?? []).map((id) => dietaryRestrictions.find((r) => r.id === id)?.name['zh-TW'] ?? id),
  ];

  const now = new Date().toISOString();
  const groupDims = (group: string) => visibleDimensions(preferenceDimensions.filter((d) => d.group === group), profile);

  const sheet = (() => {
    if (!editing) return null;
    if (editing.kind === 'dim') {
      const d = editing.dim;
      const current = displayLevel(profile.dims[d.key]);
      return (
        <ChoiceSheet
          title={intl.formatMessage({ id: 'tastemap.edit.title' }, { name: d.name['zh-TW'] })}
          choices={LEVELS.map((l) => ({ id: l.id, label: levelLabel(l.id) }))}
          value={current}
          note={intl.formatMessage({ id: 'tastemap.edit.note' })}
          onPick={(id) => apply(setDimension(profile, d.key, id as LevelId, now))}
          onClose={() => setEditing(null)}
        />
      );
    }
    if (editing.kind === 'time') {
      return (
        <ChoiceSheet
          title={intl.formatMessage({ id: 'tastemap.time' })}
          choices={TIME_OPTIONS.map((t) => ({ id: t, label: intl.formatMessage({ id: `tastemap.time.${t}` }) }))}
          value={profile.context.timePreference}
          onPick={(id) => apply(setContext(profile, { timePreference: id as (typeof TIME_OPTIONS)[number] }))}
          onClose={() => setEditing(null)}
        />
      );
    }
    return (
      <ChoiceSheet
        title={intl.formatMessage({ id: 'tastemap.adventure' })}
        choices={ADVENTURE_LEVELS.map((a) => ({ id: a.id, label: intl.formatMessage({ id: `tastemap.adventure.${a.id}` }) }))}
        value={adventureLevel(profile.context.adventure)}
        onPick={(id) => apply(setContext(profile, { adventure: ADVENTURE_LEVELS.find((a) => a.id === id)?.value ?? 0 }))}
        onClose={() => setEditing(null)}
      />
    );
  })();

  return (
    <SubPage title={srTitle}>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-0.5 rounded-chef border-2 border-bulb bg-surface px-3.5 py-3">
          <b className="font-round text-card-title">{title ?? intl.formatMessage({ id: 'tastemap.noName' })}</b>
          {challenge && <span className="text-caption text-ink-muted">{challenge}</span>}
        </div>

        <div className="overflow-hidden rounded-card bg-surface">
          <RowLink
            to="/me/diet"
            label={intl.formatMessage({ id: 'tastemap.hard' })}
            value={hardNames.length > 0 ? hardNames.join('、') : intl.formatMessage({ id: 'tastemap.hard.none' })}
          />
        </div>

        {DIMENSION_GROUPS.map((group) => {
          const dims = groupDims(group);
          if (dims.length === 0) return null;
          return (
            <section key={group} className="flex flex-col gap-1.5">
              <h2 className="m-0 text-caption font-bold text-ink-muted"><FormattedMessage id={`tastemap.group.${group}`} /></h2>
              <div className="overflow-hidden rounded-card bg-surface">
                {dims.map((d) => {
                  const state = profile.dims[d.key];
                  const level = displayLevel(state);
                  return (
                    <RowLink
                      key={d.key}
                      label={`${d.parentKey ? '　' : ''}${d.name['zh-TW']}`}
                      tag={state?.source === 'user_set'}
                      value={level ? levelLabel(level) : intl.formatMessage({ id: 'tastemap.unsure' })}
                      strong={level ? level === 'love' || level === 'like' : undefined}
                      onClick={() => setEditing({ kind: 'dim', dim: d })}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}

        <section className="flex flex-col gap-1.5">
          <h2 className="m-0 text-caption font-bold text-ink-muted"><FormattedMessage id="tastemap.group.context" /></h2>
          <div className="overflow-hidden rounded-card bg-surface">
            <RowLink
              label={intl.formatMessage({ id: 'tastemap.time' })}
              value={profile.context.timePreference ? intl.formatMessage({ id: `tastemap.time.${profile.context.timePreference}` }) : intl.formatMessage({ id: 'tastemap.unsure' })}
              strong={profile.context.timePreference ? false : undefined}
              onClick={() => setEditing({ kind: 'time' })}
            />
            <RowLink
              label={intl.formatMessage({ id: 'tastemap.adventure' })}
              value={intl.formatMessage({ id: `tastemap.adventure.${adventureLevel(profile.context.adventure)}` })}
              strong={false}
              onClick={() => setEditing({ kind: 'adventure' })}
            />
          </div>
        </section>

        {save.isError && <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="taste.saveError" /></p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => void navigate('/taste?mode=redo')} className="h-12 flex-1 border-0 bg-transparent font-[inherit] text-[15px] text-ink-muted">
            <FormattedMessage id="tastemap.redo" />
          </button>
          <button type="button" onClick={() => void navigate('/taste?mode=deep')} className="h-12 flex-1 rounded-card border-2 border-ink bg-bulb font-[inherit] text-body font-bold text-ink">
            <FormattedMessage id="taste.card.more" />
          </button>
        </div>
      </div>
      {sheet}
    </SubPage>
  );
}
