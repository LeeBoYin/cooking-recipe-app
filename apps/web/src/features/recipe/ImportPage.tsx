import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { IMPORT_MAX_TEXT_CHARS, IMPORT_MAX_URL_CHARS, newId, type ImportedRecipe, type ImportInput } from '@zhusha/core';
import { AiCallError, importRecipe, type AiError } from '../../data/ai.ts';
import { track } from '../../data/track.ts';
import { TopBar } from '../shell/SubPage.tsx';
import { DEFAULT_SERVINGS, type EditorDraft } from './model.ts';

const INPUT = 'w-full rounded-card border border-line bg-surface px-3 py-2.5 text-body text-ink';
const PRIMARY = 'min-h-12 rounded-full border-0 bg-bulb px-5 text-body font-bold font-[inherit] text-ink disabled:bg-line disabled:text-ink-muted';

// 匯入自己的失敗：請使用者改貼文字。其餘都是 AI 目前不能用
const IMPORT_ERRORS: ReadonlySet<AiError> = new Set(['import_url_invalid', 'import_fetch_failed', 'import_no_recipe']);
const PASTE_HINT: ReadonlySet<AiError> = new Set(['import_fetch_failed', 'import_no_recipe']);

// 匯入的內容轉成編輯頁的預填內容（食材與步驟的文字原樣保留，不換算）
export function editorDraftOfImport(r: ImportedRecipe): EditorDraft {
  return {
    servings: r.servings ?? DEFAULT_SERVINGS,
    ingredients: r.ingredients.map((text) => ({ id: newId(), text })),
    steps: r.steps.map((text) => ({ id: newId(), text })),
    tips: r.tips,
  };
}

// 「＋記錄 → 從網址匯入」：貼網址（或貼上食譜文字），後端讀出食譜後建立一篇新草稿、打開編輯頁，使用者看過再發佈
export function ImportPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [pasteMode, setPasteMode] = useState(false);

  const run = useMutation({
    mutationFn: async (input: ImportInput) => await importRecipe(input),
    onSuccess: (res, input) => {
      track('import.finished', { input: 'url' in input ? 'url' : 'text', result: res.via });
      void navigate(`/recipes/${newId()}/edit`, {
        replace: true,
        state: { title: res.recipe.title, draft: editorDraftOfImport(res.recipe), ...(res.recipe.source.url ? { source: res.recipe.source } : {}) },
      });
    },
    onError: (_e, input) => {
      track('import.finished', { input: 'url' in input ? 'url' : 'text', result: 'failed' });
    },
  });

  const code = run.error instanceof AiCallError ? run.error.code : run.error ? 'network' : null;
  // 網頁抓不到或讀不出食譜時，自動切到貼文字
  const pasting = pasteMode || (code !== null && PASTE_HINT.has(code));
  const busy = run.isPending;
  const submit = () => {
    if (busy) return;
    if (pasting) {
      if (text.trim()) run.mutate({ text: text.trim() });
    } else if (url.trim()) run.mutate({ url: url.trim() });
  };
  const canSubmit = !busy && (pasting ? text.trim().length > 0 : url.trim().length > 0);

  return (
    <div className="flex flex-col gap-4">
      <TopBar title={intl.formatMessage({ id: 'import.title' })} />
      <p className="m-0 text-body text-ink-muted">
        <FormattedMessage id={pasting ? 'import.paste.intro' : 'import.intro'} />
      </p>

      {pasting ? (
        <label className="flex flex-col gap-1">
          <span className="text-caption text-ink-muted">
            <FormattedMessage id="import.paste.label" />
          </span>
          <textarea
            value={text}
            maxLength={IMPORT_MAX_TEXT_CHARS}
            rows={10}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            className={`${INPUT} resize-y font-[inherit]`}
          />
        </label>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-caption text-ink-muted">
            <FormattedMessage id="import.url.label" />
          </span>
          <input
            type="url"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={url}
            maxLength={IMPORT_MAX_URL_CHARS}
            placeholder="https://"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            disabled={busy}
            className={INPUT}
          />
        </label>
      )}

      {code && (
        <p role="alert" className="m-0 text-body text-error">
          <FormattedMessage id={IMPORT_ERRORS.has(code) || code === 'network' ? `import.error.${code}` : 'import.error.unavailable'} />
        </p>
      )}
      {busy && (
        <p role="status" className="m-0 text-body text-ink-muted">
          <FormattedMessage id="import.reading" />
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!canSubmit} onClick={submit} className={PRIMARY}>
          <FormattedMessage id="import.submit" />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setPasteMode(!pasting)}
          className="min-h-11 border-0 bg-transparent px-1 text-caption font-[inherit] text-ink-muted underline"
        >
          <FormattedMessage id={pasting ? 'import.switch.url' : 'import.switch.paste'} />
        </button>
      </div>
    </div>
  );
}
