import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, useNavigate, useParams } from 'react-router';
import { DIFFICULTY_FACETS, difficultyOverall } from '@zhusha/core';
import type { RecipeIngredient, RecipeStep, RecipeVisibility } from '@zhusha/shared-types';
import { usePhotoUrls, useRecipe, useRecipePhotos } from '../../data/hooks.ts';
import { Icon } from '../shell/Icon.tsx';
import { DifficultyRadar } from './DifficultyRadar.tsx';
import { knownHighlights } from './model.ts';
import { PhotoViewer, type ViewerPhoto } from './PhotoViewer.tsx';

const TILT = ['-rotate-3', 'rotate-2'];
const HEADING = 'm-0 font-round text-card-title';

// 食譜頁（自己的）：文字在前、照片在後——菜名與心得 → 難易度 → 一排照片 → 食材 → 做法 → 料理筆記
export function RecipePage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { id } = useParams();
  const recipe = useRecipe(id);
  const photos = useRecipePhotos(id);
  const [viewer, setViewer] = useState<{ list: ViewerPhoto[]; index: number } | null>(null);
  const [facetsOpen, setFacetsOpen] = useState(false);

  const rows = photos.data ?? [];
  const top = rows.filter((p) => p.owner_type === 'recipe');
  const stepPhoto = (stepId: string) => rows.find((p) => p.owner_type === 'recipe_step' && p.owner_id === stepId);
  const urls = usePhotoUrls(rows.map((p) => p.thumb_path)).data;
  const r = recipe.data;

  if (recipe.isPending || photos.isPending) {
    return <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>;
  }
  if (recipe.isError || photos.isError) {
    return <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="recipe.loadError" /></p>;
  }
  if (!r || r.deleted_at) {
    return <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="recipe.notFound" /></p>;
  }

  const date = intl.formatDate(r.cooked_at ?? r.published_at ?? r.created_at, { month: 'numeric', day: 'numeric' });
  const title = r.title?.trim() || intl.formatMessage({ id: 'recipe.view.untitled' }, { date });
  const highlights = knownHighlights(r.highlights);
  const ingredients = r.ingredients as RecipeIngredient[];
  const steps = (r.steps as RecipeStep[]).slice().sort((a, b) => a.order - b.order);
  const d = r.difficulty as Record<string, number> | null;
  const values = d && DIFFICULTY_FACETS.every((f) => typeof d[f] === 'number')
    ? { ingredients: d.ingredients!, equipment: d.equipment!, time: d.time!, technique: d.technique!, failure_risk: d.failure_risk! }
    : null;
  const overall = values ? (d?.overall ?? difficultyOverall(values)) : null;
  const originals = top.map((p): ViewerPhoto => ({ id: p.id, path: p.storage_path }));
  const cell = 'flex h-[110px] items-center justify-center overflow-hidden bg-photo-empty';
  const shown = top.length > 3 ? top.slice(0, 2) : top.slice(0, 3);
  const more = top.length - 2;

  return (
    <div className="flex flex-col gap-3.5 pb-28">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label={intl.formatMessage({ id: 'common.back' })}
          onClick={() => void navigate(-1)}
          className="flex size-11 items-center justify-center rounded-card border-0 bg-surface text-ink"
        >
          <Icon name="back" />
        </button>
      </div>

      <article className="flex flex-col gap-2 rounded-card bg-surface p-3">
        <div className="flex items-center gap-2 text-caption">
          <span className="flex size-7 items-center justify-center rounded-full bg-line-soft text-small font-bold">
            <FormattedMessage id="recipe.view.me" />
          </span>
          <span className="flex-1">
            <b><FormattedMessage id="recipe.view.me" /></b>
            <span className="text-ink-muted">
              ・<FormattedMessage id="recipe.view.meta" values={{ date, visibility: intl.formatMessage({ id: `recipe.visibility.${r.visibility as RecipeVisibility}` }) }} />
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 font-round text-title font-bold">{title}</h1>
          {highlights.map((h, i) => (
            <span key={h} className={`inline-block ${TILT[i % 2]} rounded-[4px] border-[1.5px] border-dashed border-ink bg-surface px-2 py-0.5 text-small font-bold`}>
              <FormattedMessage id={`highlight.${h}`} />
            </span>
          ))}
        </div>
        {r.story && <p className="m-0 whitespace-pre-wrap text-[15px] leading-[1.7]">{r.story}</p>}
        {r.status === 'draft' && <p className="m-0 text-small text-ink-muted"><FormattedMessage id="recipe.view.draftNote" /></p>}
      </article>

      {values && overall && (
        <div className="rounded-card bg-surface">
          <button
            type="button"
            aria-expanded={facetsOpen}
            aria-label={intl.formatMessage({ id: 'recipe.view.difficultyAria' }, { value: overall })}
            onClick={() => setFacetsOpen((o) => !o)}
            className="flex w-full items-center gap-3 border-0 bg-transparent px-3 py-2.5 text-left font-[inherit] text-ink"
          >
            <DifficultyRadar values={values} />
            <span className="flex flex-1 flex-col gap-0.5">
              <b className="text-[15px]"><FormattedMessage id="recipe.view.difficulty" values={{ value: overall }} /></b>
              <span className="text-small text-ink-muted">
                {DIFFICULTY_FACETS.map((f) => `${intl.formatMessage({ id: `recipe.facet.${f}` })} ${values[f]}`).join('・')}
              </span>
            </span>
          </button>
        </div>
      )}

      {top.length > 0 && (
        <div className="grid grid-cols-3 gap-1">
          {shown.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-label={intl.formatMessage({ id: 'recipe.view.photoOpen' }, { n: i + 1 })}
              onClick={() => setViewer({ list: originals, index: i })}
              className={`${cell} border-0 p-0 ${i === 0 ? 'rounded-l-card' : ''} ${i === shown.length - 1 && top.length <= 3 ? 'rounded-r-card' : ''}`}
            >
              {urls?.[p.thumb_path] && <img src={urls[p.thumb_path]} alt="" className="max-h-full max-w-full object-contain" />}
            </button>
          ))}
          {top.length > 3 && (
            <button
              type="button"
              onClick={() => setViewer({ list: originals, index: 2 })}
              className={`${cell} rounded-r-card border-0 bg-line-strong p-0 text-body font-bold text-ink`}
            >
              <FormattedMessage id="recipe.view.photoMore" values={{ count: more }} />
            </button>
          )}
        </div>
      )}

      {ingredients.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className={HEADING}><FormattedMessage id="recipe.view.ingredients" /></h2>
            {r.servings && (
              <span className="rounded-full border border-line bg-surface px-3 py-1 text-caption">
                <FormattedMessage id="recipe.view.servings" values={{ count: r.servings }} />
              </span>
            )}
          </div>
          <ul className="-mt-1.5 m-0 list-none rounded-card bg-surface px-3 py-0.5">
            {ingredients.map((i) => (
              <li key={i.id} className="border-b border-line-soft py-2.5 text-[15px] last:border-b-0">{i.raw_text}</li>
            ))}
          </ul>
        </>
      )}

      {steps.length > 0 && (
        <>
          <h2 className={HEADING}><FormattedMessage id="recipe.view.steps" /></h2>
          <ol className="-mt-1.5 m-0 flex list-none flex-col rounded-card bg-surface p-0">
            {steps.map((s, i) => {
              const photo = stepPhoto(s.id);
              return (
                <li key={s.id} className="flex gap-2.5 border-b border-line-soft p-3 last:border-b-0">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-small font-bold text-surface">{i + 1}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="whitespace-pre-wrap text-[15px] leading-relaxed">{s.text}</span>
                    {photo && (
                      <button
                        type="button"
                        aria-label={intl.formatMessage({ id: 'recipe.view.photoOpen' }, { n: i + 1 })}
                        onClick={() => setViewer({ list: [{ id: photo.id, path: photo.storage_path }], index: 0 })}
                        className="flex h-[72px] w-24 items-center justify-center overflow-hidden rounded-card border-0 bg-photo-empty p-0"
                      >
                        {urls?.[photo.thumb_path] && <img src={urls[photo.thumb_path]} alt="" className="max-h-full max-w-full object-contain" />}
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {r.tips && (
        <section className="flex flex-col gap-1 rounded-card bg-bulb-soft p-3">
          <b className="text-[15px]"><FormattedMessage id="recipe.view.notes" /></b>
          <span className="whitespace-pre-wrap text-[15px] leading-relaxed">{r.tips}</span>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[560px] gap-2.5 border-t border-line bg-bg px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <Link to={`/recipes/${r.id}/edit`} className="flex h-12 flex-1 items-center justify-center rounded-card bg-bulb text-body font-bold text-ink no-underline">
          <FormattedMessage id="recipe.view.edit" />
        </Link>
      </div>

      {viewer && (
        <PhotoViewer
          photos={viewer.list}
          index={viewer.index}
          onIndex={(index) => setViewer({ ...viewer, index })}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
