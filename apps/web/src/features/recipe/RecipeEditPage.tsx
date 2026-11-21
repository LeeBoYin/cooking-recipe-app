import { useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useLocation, useNavigate, useParams } from 'react-router';
import type { RecipeVisibility } from '@zhusha/shared-types';
import { useDeleteRecipe, useLinkBookmark, useMySettings, usePhotoUrls, useRecipe, useRecipePhotos } from '../../data/hooks.ts';
import { recipeLimits, type Recipe } from '../../data/recipes.ts';
import type { Photo } from '../../data/photos.ts';
import { setUnsavedEdits } from '../../pwa/unsaved.ts';
import { preloadWebpEncoder } from '../../photos/encode.ts';
import { Icon } from '../shell/Icon.tsx';
import { TopBar } from '../shell/SubPage.tsx';
import {
  DEFAULT_SERVINGS,
  HIGHLIGHTS,
  canAddStep,
  hasContent,
  overBy,
  overLimit,
  textLimits,
  type EditorPhoto,
  type EditorStep,
} from './model.ts';
import { PhotoStrip } from './PhotoStrip.tsx';
import { SortableItem, SortableList } from './SortableList.tsx';
import { useRecipeEditor } from './useRecipeEditor.ts';

const VISIBILITIES: RecipeVisibility[] = ['friends', 'household', 'private'];
const CARD = 'rounded-card bg-surface p-3';
const LABEL = 'text-caption text-ink-muted';
const INPUT = 'w-full rounded-card border border-line bg-surface px-3 py-2.5 text-body text-ink';
const PILL = 'h-9 rounded-full border px-3 text-caption font-[inherit] text-ink';

function FieldError({ id, values }: { id: string; values: { limit: number; over: number } }) {
  return (
    <p role="alert" className="m-0 text-small text-error">
      <FormattedMessage id={id} values={values} />
    </p>
  );
}

// 可以收合的區塊：新的一篇先收著，只顯示標題與一行摘要
function Section({ title, hint, open, onToggle, children }: {
  title: string;
  hint: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-14 w-full items-center gap-2 border-0 bg-transparent px-3 text-left font-[inherit] text-ink"
      >
        <span className="flex flex-1 flex-col gap-0.5">
          <b className="text-body">{title}</b>
          <span className="text-small text-ink-muted">{hint}</span>
        </span>
        <Icon name={open ? 'down' : 'right'} size={20} className="text-ink-muted" />
      </button>
      {open && <div className="flex flex-col gap-4 px-3 pb-3">{children}</div>}
    </section>
  );
}

function StepRow({ step, index, thumb, onText, onPhoto, onRemovePhoto, onRemove, over, autoFocus }: {
  step: EditorStep;
  index: number;
  thumb: string | undefined;
  onText: (text: string) => void;
  onPhoto: (file: File) => void;
  onRemovePhoto: () => void;
  onRemove: () => void;
  over: number;
  autoFocus: boolean;
}) {
  const intl = useIntl();
  const input = useRef<HTMLInputElement>(null);
  return (
    <SortableItem id={step.id} handleLabel={intl.formatMessage({ id: 'recipe.step.drag' }, { n: index + 1 })} className="flex items-start gap-1">
      <span className="mt-2.5 mr-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-small font-bold text-surface">{index + 1}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <textarea
          rows={2}
          autoFocus={autoFocus}
          value={step.text}
          aria-label={intl.formatMessage({ id: 'recipe.step.aria' }, { n: index + 1 })}
          aria-invalid={over > 0}
          onChange={(e) => onText(e.target.value)}
          className={`${INPUT} resize-none leading-relaxed ${over > 0 ? 'border-error' : ''}`}
        />
        {over > 0 && <FieldError id="recipe.error.stepOver" values={{ limit: textLimits.step, over }} />}
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onPhoto(file);
          }}
        />
        {step.photo ? (
          <div className="flex items-center gap-1.5">
            <div className="flex size-14 items-center justify-center overflow-hidden rounded-card bg-photo-empty">
              {thumb && <img src={thumb} alt="" className="max-h-full max-w-full object-contain" />}
            </div>
            <button type="button" onClick={() => input.current?.click()} className="h-9 border-0 bg-transparent px-2 text-small text-ink-muted underline underline-offset-4">
              <FormattedMessage id="recipe.step.replacePhoto" />
            </button>
            <button type="button" onClick={onRemovePhoto} className="h-9 border-0 bg-transparent px-2 text-small text-ink-muted underline underline-offset-4">
              <FormattedMessage id="recipe.step.removePhoto" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex h-9 items-center gap-1 self-start rounded-card border border-dashed border-[#b9a88f] bg-surface px-2.5 text-small font-[inherit] text-ink"
          >
            <Icon name="camera" size={16} />
            <FormattedMessage id="recipe.step.addPhoto" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={intl.formatMessage({ id: 'recipe.step.remove' }, { n: index + 1 })}
        className="flex size-11 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-ink-muted"
      >
        <Icon name="trash" size={20} />
      </button>
    </SortableItem>
  );
}

function Editor({ recipeId, recipe, photoRows, defaultServings }: { recipeId: string; recipe: Recipe | null; photoRows: Photo[]; defaultServings: number }) {
  const intl = useIntl();
  const navigate = useNavigate();
  const location = useLocation();
  const fromState = location.state as { title?: string; bookmarkId?: string } | null;
  const initialTitle = fromState?.title;
  const linkBookmark = useLinkBookmark();
  const ed = useRecipeEditor(recipeId, recipe, photoRows, initialTitle, defaultServings);
  const remove = useDeleteRecipe();
  const { form, patchForm, setForm } = ed;
  const [methodOpen, setMethodOpen] = useState(
    form.ingredients.length > 0 || form.steps.length > 0 || form.tips !== '',
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null); // 剛新增的列，游標放進去

  // iPhone 的 Safari 才需要 WebP 轉檔程式，打開編輯頁時先預載
  useEffect(() => {
    void preloadWebpEncoder().catch(() => undefined);
  }, []);

  // 已發佈的改了沒儲存就關掉分頁或重新整理時，瀏覽器會問一次
  useEffect(() => {
    if (ed.isDraft || !ed.dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    setUnsavedEdits(true); // 讓「有新版本」的提示知道，重新整理前要先提醒
    return () => {
      window.removeEventListener('beforeunload', handler);
      setUnsavedEdits(false);
    };
  }, [ed.isDraft, ed.dirty]);

  const paths = [...form.photos, ...form.steps.flatMap((s) => (s.photo ? [s.photo] : []))].flatMap((p) => (p.thumbPath ? [p.thumbPath] : []));
  const urls = usePhotoUrls(paths).data;
  const urlFor = (p: EditorPhoto) => ed.previews.get(p.id) ?? (p.thumbPath ? urls?.[p.thumbPath] : undefined);

  const over = overLimit(form);
  const titleOver = overBy(form.title, textLimits.title);
  const storyOver = overBy(form.story, textLimits.story);
  const tipsOver = overBy(form.tips, textLimits.tips);
  const canPublish = hasContent(form) && ed.pendingCount === 0 && !over && !publishing;

  async function publish() {
    setPublishing(true);
    const result = await ed.publish();
    setPublishing(false);
    if (result) {
      if (fromState?.bookmarkId) linkBookmark.mutate({ bookmarkId: fromState.bookmarkId, recipeId });
      void navigate(`/recipes/${recipeId}`, { replace: true, state: { published: true } });
    }
  }

  async function saveAndClose() {
    const result = await ed.save();
    if (result) void navigate(`/recipes/${recipeId}`, { replace: true });
  }

  function back() {
    if (!ed.isDraft && ed.dirty) setLeaveAsk(true);
    else void navigate(-1);
  }

  const status = (() => {
    if (ed.saveState === 'error') return { text: ed.saveFailedOnServer ? 'recipe.status.errorServer' : 'recipe.status.error', dot: 'error' as const };
    if (!ed.isDraft) return ed.dirty ? { text: 'recipe.status.dirty', dot: 'bulb' as const } : null;
    if (ed.saveState === 'saving') return { text: 'recipe.status.saving', dot: null };
    if (ed.recipe) return { text: 'recipe.status.draft', dot: 'check' as const };
    return null;
  })();

  const hint = !hasContent(form)
    ? intl.formatMessage({ id: 'recipe.hint.needContent' })
    : ed.pendingCount > 0
      ? intl.formatMessage({ id: 'recipe.hint.uploading' }, { count: ed.pendingCount })
      : null;

  const methodSummary = intl.formatMessage(
    { id: 'recipe.method.summary' },
    {
      servings: form.servings,
      ingredients: form.ingredients.filter((i) => i.text.trim()).length,
      steps: form.steps.length,
    },
  );

  return (
    <div className="flex flex-col gap-3.5 pb-44">
      <TopBar
        className=""
        onBack={back}
        rightFill
        right={
          <>
        <span role="status" className="flex flex-1 items-center justify-end gap-1.5 text-small text-ink-muted">
          {status?.dot === 'check' && <Icon name="check" size={16} className="text-green" />}
          {status?.dot === 'bulb' && <span aria-hidden="true" className="size-2 rounded-full bg-bulb" />}
          {status?.dot === 'error' && <span aria-hidden="true" className="size-2 rounded-full bg-error" />}
          {status && <FormattedMessage id={status.text} />}
        </span>
        {ed.recipe && (
          <div className="relative">
            <button
              type="button"
              aria-label={intl.formatMessage({ id: 'recipe.more' })}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className="flex size-11 items-center justify-center rounded-card border-0 bg-transparent text-ink"
            >
              <Icon name="more" />
            </button>
            {menuOpen && (
              <div className="absolute top-12 right-0 z-20 w-64 rounded-card bg-surface px-3 shadow-[0_2px_12px_rgba(43,38,34,0.12)]">
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(recipeId, { onSuccess: () => void navigate('/recipes', { replace: true }) })}
                  className="h-12 w-full border-0 bg-transparent p-0 text-left text-body font-[inherit] text-error"
                >
                  <FormattedMessage id="recipe.delete" />
                </button>
              </div>
            )}
          </div>
        )}
          </>
        }
      />

      <section className={`${CARD} flex flex-col gap-1.5`}>
        <label className="flex flex-col">
          <span className="sr-only"><FormattedMessage id="recipe.field.title" /></span>
          <input
            type="text"
            value={form.title}
            placeholder={intl.formatMessage({ id: 'recipe.field.title' })}
            aria-invalid={titleOver > 0}
            onChange={(e) => patchForm({ title: e.target.value })}
            className={`border-0 bg-transparent py-1 font-round text-title font-bold text-ink outline-none placeholder:text-ink-muted ${titleOver > 0 ? 'rounded-card border border-error' : ''}`}
          />
        </label>
        {titleOver > 0 && <FieldError id="recipe.error.titleOver" values={{ limit: textLimits.title, over: titleOver }} />}
        <div className="h-px bg-line-soft" />
        <label className="flex flex-col">
          <span className="sr-only"><FormattedMessage id="recipe.field.story" /></span>
          <textarea
            rows={3}
            value={form.story}
            placeholder={intl.formatMessage({ id: 'recipe.field.story' })}
            aria-invalid={storyOver > 0}
            onChange={(e) => patchForm({ story: e.target.value })}
            className="resize-none border-0 bg-transparent py-1 text-body leading-[1.7] text-ink outline-none placeholder:text-ink-muted"
          />
        </label>
        {storyOver > 0 && <FieldError id="recipe.error.storyOver" values={{ limit: textLimits.story, over: storyOver }} />}
      </section>

      <PhotoStrip
        photos={form.photos}
        urlFor={urlFor}
        statusOf={ed.photoStatus}
        onAdd={(files) => void ed.addPhotos(files)}
        onRemove={ed.removePhoto}
        onReorder={ed.reorderPhotos}
        onRetry={ed.retryUploads}
      />
      {!ed.isDraft && (
        <p className="-mt-2 m-0 text-small text-ink-muted"><FormattedMessage id="recipe.photo.publishedHelp" /></p>
      )}

      <Section title={intl.formatMessage({ id: 'recipe.method' })} hint={methodOpen ? intl.formatMessage({ id: 'recipe.method.hint' }) : methodSummary} open={methodOpen} onToggle={() => setMethodOpen((o) => !o)}>
        <div className="flex items-center justify-between">
          <span className={LABEL}><FormattedMessage id="recipe.servings" /></span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label={intl.formatMessage({ id: 'recipe.servings.less' })} disabled={form.servings <= 1} onClick={() => patchForm({ servings: form.servings - 1 })} className="size-9 rounded-full border border-line bg-surface text-body text-ink disabled:opacity-40">−</button>
            <b className="min-w-6 text-center text-body">{form.servings}</b>
            <button type="button" aria-label={intl.formatMessage({ id: 'recipe.servings.more' })} disabled={form.servings >= 100} onClick={() => patchForm({ servings: form.servings + 1 })} className="size-9 rounded-full border border-line bg-surface text-body text-ink disabled:opacity-40">＋</button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={LABEL}><FormattedMessage id="recipe.ingredients.help" /></span>
          <div className="flex flex-col rounded-card border border-line px-1">
            <SortableList ids={form.ingredients.map((i) => i.id)} onReorder={ed.reorderIngredients}>
              {form.ingredients.map((ing, i) => (
                <SortableItem
                  key={ing.id}
                  id={ing.id}
                  handleLabel={intl.formatMessage({ id: 'recipe.ingredient.drag' }, { n: i + 1 })}
                  className="flex items-center border-b border-line-soft"
                >
                  <input
                    type="text"
                    autoFocus={focusId === ing.id}
                    value={ing.text}
                    aria-label={intl.formatMessage({ id: 'recipe.ingredient.aria' }, { n: i + 1 })}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, ingredients: f.ingredients.map((x) => (x.id === ing.id ? { ...x, text: e.target.value } : x)) }))
                    }
                    className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-body text-ink outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => ed.removeIngredient(ing.id)}
                    aria-label={intl.formatMessage({ id: 'recipe.ingredient.remove' }, { n: i + 1 })}
                    className="flex size-11 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-ink-muted"
                  >
                    <Icon name="trash" size={20} />
                  </button>
                </SortableItem>
              ))}
            </SortableList>
            <button type="button" onClick={() => setFocusId(ed.addIngredient())} className="h-11 border-0 bg-transparent px-2 text-left text-body font-[inherit] text-ink-muted">
              <FormattedMessage id="recipe.ingredients.add" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className={LABEL}>
            <FormattedMessage id="recipe.steps.help" values={{ max: recipeLimits.steps }} />
          </span>
          <SortableList ids={form.steps.map((s) => s.id)} onReorder={ed.reorderSteps}>
          {form.steps.map((s, i) => (
            <StepRow
              key={s.id}
              step={s}
              index={i}
              thumb={s.photo ? urlFor(s.photo) : undefined}
              over={overBy(s.text, textLimits.step)}
              autoFocus={focusId === s.id}
              onText={(text) => setForm((f) => ({ ...f, steps: f.steps.map((x) => (x.id === s.id ? { ...x, text } : x)) }))}
              onPhoto={(file) => void ed.addPhotos([file], s.id)}
              onRemovePhoto={() => s.photo && ed.removePhoto(s.photo.id)}
              onRemove={() => ed.removeStep(s.id)}
            />
          ))}
          </SortableList>
          <button
            type="button"
            disabled={!canAddStep(form)}
            onClick={() => setFocusId(ed.addStep())}
            className="h-11 rounded-card border border-line bg-surface text-body font-[inherit] text-ink disabled:border-dashed disabled:border-line-strong disabled:bg-transparent disabled:text-ink-muted"
          >
            {canAddStep(form) ? (
              <FormattedMessage id="recipe.step.add" />
            ) : (
              <FormattedMessage id="recipe.step.max" values={{ max: recipeLimits.steps }} />
            )}
          </button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={LABEL}><FormattedMessage id="recipe.tips" /></span>
          <textarea
            rows={2}
            value={form.tips}
            aria-invalid={tipsOver > 0}
            onChange={(e) => patchForm({ tips: e.target.value })}
            className={`${INPUT} resize-none leading-relaxed ${tipsOver > 0 ? 'border-error' : ''}`}
          />
          {tipsOver > 0 && <FieldError id="recipe.error.tipsOver" values={{ limit: textLimits.tips, over: tipsOver }} />}
        </label>
      </Section>

      <section className="flex flex-col gap-2">
        <span className={LABEL}><FormattedMessage id="recipe.highlights" /></span>
        <div className="flex flex-wrap gap-1.5">
          {HIGHLIGHTS.map((h) => {
            const on = form.highlights.includes(h);
            return (
              <button
                key={h}
                type="button"
                aria-pressed={on}
                onClick={() => patchForm({ highlights: on ? form.highlights.filter((x) => x !== h) : [...form.highlights, h] })}
                className={`${PILL} ${on ? 'border-bulb bg-bulb-soft font-bold' : 'border-line bg-surface'}`}
              >
                <FormattedMessage id={`highlight.${h}`} />
              </button>
            );
          })}
        </div>
      </section>

      {ed.removed && (
        <div role="status" className="fixed inset-x-4 bottom-[calc(112px+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-[528px] min-h-12 items-center justify-between rounded-card bg-ink pr-1 pl-3.5 text-body text-surface">
          <FormattedMessage id="recipe.photo.removed" />
          <button type="button" onClick={ed.undoRemove} className="h-11 border-0 bg-transparent px-3 text-body font-bold font-[inherit] text-bulb">
            <FormattedMessage id="recipe.photo.undo" />
          </button>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[560px] flex-col gap-1.5 border-t border-line bg-bg px-4 pt-2.5 pb-[calc(16px+env(safe-area-inset-bottom))]">
        {ed.isDraft && hint && <span className="text-center text-small text-ink-muted">{hint}</span>}
        <div className="flex gap-2.5">
          <label className="relative flex h-12 flex-1 items-center justify-center gap-1.5 rounded-card bg-surface text-body font-bold text-ink">
            <Icon name="people" size={20} />
            <FormattedMessage id={`recipe.visibility.${form.visibility}`} />
            <Icon name="down" size={16} />
            <select
              value={form.visibility}
              aria-label={intl.formatMessage({ id: 'recipe.visibility.label' })}
              onChange={(e) => patchForm({ visibility: e.target.value as RecipeVisibility })}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {VISIBILITIES.map((v) => (
                <option key={v} value={v}>{intl.formatMessage({ id: `recipe.visibility.${v}` })}</option>
              ))}
            </select>
          </label>
          {ed.isDraft ? (
            <button
              type="button"
              disabled={!canPublish}
              onClick={() => void publish()}
              className="h-12 flex-[1.3] rounded-card border-0 bg-bulb text-body font-bold font-[inherit] text-ink disabled:bg-line disabled:text-ink-muted"
            >
              <FormattedMessage id={publishing ? 'recipe.publishing' : 'recipe.publish'} />
            </button>
          ) : (
            <button
              type="button"
              disabled={!ed.dirty || !!over || ed.pendingCount > 0 || ed.saveState === 'saving'}
              onClick={() => void saveAndClose()}
              className="h-12 flex-[1.3] rounded-card border-0 bg-bulb text-body font-bold font-[inherit] text-ink disabled:bg-line disabled:text-ink-muted"
            >
              <FormattedMessage id={ed.saveState === 'saving' ? 'recipe.saving' : 'recipe.save'} />
            </button>
          )}
        </div>
      </div>

      {leaveAsk && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="leave-title" className="flex w-full max-w-[528px] flex-col gap-3 rounded-chef bg-surface p-4">
            <h2 id="leave-title" className="m-0 font-round text-card-title">
              <FormattedMessage id="recipe.leave.title" />
            </h2>
            <p className="m-0 text-body"><FormattedMessage id="recipe.leave.body" /></p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void navigate(-1)} className="h-12 flex-1 rounded-card border border-line bg-surface text-body font-[inherit] text-error">
                <FormattedMessage id="recipe.leave.discard" />
              </button>
              <button type="button" onClick={() => void saveAndClose()} className="h-12 flex-[1.4] rounded-card border-0 bg-bulb text-body font-bold font-[inherit] text-ink">
                <FormattedMessage id="recipe.leave.save" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 記錄一道菜／編輯一篇食譜：照片、文字、做法、為什麼值得記住、難易度
export function RecipeEditPage() {
  const intl = useIntl();
  const { id } = useParams();
  const recipe = useRecipe(id);
  const photos = useRecipePhotos(id);
  const settings = useMySettings();
  return (
    <section>
      <h1 className="sr-only">{intl.formatMessage({ id: 'recipe.edit.title' })}</h1>
      {recipe.isPending || photos.isPending || settings.isPending ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>
      ) : recipe.isError || photos.isError ? (
        <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="recipe.loadError" /></p>
      ) : recipe.data?.deleted_at ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="recipe.notFound" /></p>
      ) : (
        // key：換一篇時整個重新開始；null 就是還沒存過的新草稿
        <Editor key={id} recipeId={id as string} recipe={recipe.data ?? null} photoRows={photos.data ?? []} defaultServings={settings.data?.household_size ?? DEFAULT_SERVINGS} />
      )}
    </section>
  );
}
