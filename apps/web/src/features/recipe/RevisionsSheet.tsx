import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { RecipeRevision } from '../../data/recipeRevisions.ts';
import type { Recipe } from '../../data/recipes.ts';
import { useRecipeRevisions, useRestoreRecipeRevision } from '../../data/hooks.ts';
import { track } from '../../data/track.ts';
import { Sheet } from '../../ui/Sheet.tsx';
import { useToast } from '../shell/Toast.tsx';
import { revisionChanges } from './revisionDiff.ts';

const ROW = 'flex min-h-12 w-full items-center gap-2 border-0 border-b border-line-soft bg-transparent px-0 py-2 text-left font-[inherit] text-ink last:border-b-0';

function ChangeList({ kind, lines }: { kind: 'added' | 'removed'; lines: string[] }) {
  return lines.map((text, i) => (
    <li key={`${kind}-${i}`} className={`text-[15px] ${kind === 'added' ? 'text-ink' : 'text-ink-muted line-through'}`}>
      <FormattedMessage id={`recipe.revisions.${kind}`} values={{ text }} />
    </li>
  ));
}

// 版本列表（只有作者）：點進去看這一版和上一版的差異與內容，可以「還原成這一版」
export function RevisionsSheet({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const intl = useIntl();
  const toast = useToast();
  const revisions = useRecipeRevisions(recipe.id);
  const restore = useRestoreRecipeRevision();
  const [selected, setSelected] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const list = revisions.data ?? [];
  const index = list.findIndex((r) => r.version === selected);
  const rev: RecipeRevision | undefined = index >= 0 ? list[index] : undefined;
  const prev = index >= 0 ? list[index + 1] : undefined;

  return (
    <Sheet label={intl.formatMessage({ id: 'recipe.revisions.title' })} onClose={onClose}>
      {(requestClose) => (
        <div className="flex flex-col gap-3 pb-4">
          <h2 className="m-0 font-round text-card-title"><FormattedMessage id="recipe.revisions.title" /></h2>

          {revisions.isPending && <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>}
          {revisions.isError && <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="recipe.revisions.loadError" /></p>}
          {revisions.data && list.length === 0 && (
            <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="recipe.revisions.empty" /></p>
          )}

          {!rev && list.length > 0 && (
            <ul className="m-0 list-none p-0">
              {list.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => { setSelected(r.version); setConfirming(false); }} className={ROW}>
                    <b className="min-w-10"><FormattedMessage id="recipe.revisions.item" values={{ version: r.version }} /></b>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-caption"><FormattedMessage id="recipe.revisions.time" values={{ time: new Date(r.created_at) }} /></span>
                      <span className="text-small text-ink-muted"><FormattedMessage id={`recipe.revisions.by.${r.changed_by}`} /></span>
                    </span>
                    {r.version === recipe.version && <span className="text-small text-ink-muted"><FormattedMessage id="recipe.revisions.latest" /></span>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {rev && (
            <>
              <button type="button" onClick={() => setSelected(null)} className="self-start border-0 bg-transparent p-0 text-caption font-bold text-ink underline">
                <FormattedMessage id="recipe.revisions.back" />
              </button>
              <div className="flex flex-col">
                <b><FormattedMessage id="recipe.revisions.item" values={{ version: rev.version }} /></b>
                <span className="text-small text-ink-muted">
                  <FormattedMessage id="recipe.revisions.time" values={{ time: new Date(rev.created_at) }} />・<FormattedMessage id={`recipe.revisions.by.${rev.changed_by}`} />
                </span>
              </div>

              {prev && (() => {
                const c = revisionChanges(prev.snapshot, rev.snapshot);
                const none = !c.title && !c.servings && !c.tips && c.ingredients.added.length + c.ingredients.removed.length + c.steps.added.length + c.steps.removed.length === 0;
                return (
                  <section className="flex flex-col gap-1">
                    <b className="text-[15px]"><FormattedMessage id="recipe.revisions.changes" /></b>
                    {none ? (
                      <span className="text-caption text-ink-muted"><FormattedMessage id="recipe.revisions.noChanges" /></span>
                    ) : (
                      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                        {c.title && <li className="text-[15px]"><FormattedMessage id="recipe.revisions.titleChanged" /></li>}
                        {c.servings && <li className="text-[15px]"><FormattedMessage id="recipe.revisions.servingsChanged" /></li>}
                        {c.tips && <li className="text-[15px]"><FormattedMessage id="recipe.revisions.tipsChanged" /></li>}
                        <ChangeList kind="added" lines={[...c.ingredients.added, ...c.steps.added]} />
                        <ChangeList kind="removed" lines={[...c.ingredients.removed, ...c.steps.removed]} />
                      </ul>
                    )}
                  </section>
                );
              })()}

              <section className="flex flex-col gap-1 rounded-card bg-surface p-3">
                <b className="text-[15px]"><FormattedMessage id="recipe.revisions.content" /></b>
                {rev.snapshot.ingredients.length > 0 && (
                  <>
                    <span className="text-small text-ink-muted"><FormattedMessage id="recipe.revisions.ingredients" /></span>
                    <ul className="m-0 list-none p-0">
                      {rev.snapshot.ingredients.map((i) => <li key={i.id} className="text-[15px]">{i.raw_text}</li>)}
                    </ul>
                  </>
                )}
                {rev.snapshot.steps.length > 0 && (
                  <>
                    <span className="text-small text-ink-muted"><FormattedMessage id="recipe.revisions.steps" /></span>
                    <ol className="m-0 pl-5">
                      {rev.snapshot.steps.slice().sort((a, b) => a.order - b.order).map((s) => <li key={s.id} className="whitespace-pre-wrap text-[15px]">{s.text}</li>)}
                    </ol>
                  </>
                )}
                {rev.snapshot.tips && <span className="whitespace-pre-wrap text-[15px]">{rev.snapshot.tips}</span>}
              </section>

              {rev.version !== recipe.version && !confirming && (
                <button type="button" onClick={() => setConfirming(true)} className="min-h-11 rounded-card border border-line bg-surface font-bold text-ink">
                  <FormattedMessage id="recipe.revisions.restore" />
                </button>
              )}
              {confirming && (
                <div role="alertdialog" className="flex flex-col gap-2 rounded-card bg-chef-soft p-3">
                  <span className="text-[15px]"><FormattedMessage id="recipe.revisions.restoreConfirm" values={{ version: rev.version }} /></span>
                  {restore.isError && <span role="alert" className="text-caption text-error"><FormattedMessage id="recipe.revisions.restoreError" /></span>}
                  <div className="flex gap-2">
                    <button type="button" disabled={restore.isPending} onClick={() => setConfirming(false)} className="min-h-11 flex-1 rounded-card border border-line bg-surface text-ink">
                      <FormattedMessage id="recipe.revisions.cancel" />
                    </button>
                    <button
                      type="button"
                      disabled={restore.isPending}
                      onClick={() =>
                        restore.mutate({ recipe, version: rev.version }, {
                          onSuccess: () => {
                            track('recipe.revision_restored');
                            toast(intl.formatMessage({ id: 'recipe.revisions.restored' }, { version: rev.version }));
                            requestClose();
                          },
                        })
                      }
                      className="min-h-11 flex-1 rounded-card border-0 bg-ink font-bold text-surface"
                    >
                      <FormattedMessage id="recipe.revisions.restoreDo" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
