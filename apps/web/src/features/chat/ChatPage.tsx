import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { CHAT_MAX_TURNS, CHAT_MAX_USER_CHARS, parseTemperaturePref, type ChatAsk, type ChatMessage } from '@zhusha/core';
import { Chef } from '../../chef/Chef.tsx';
import { AiCallError, isResumable, type AiError, type ChatConversation } from '../../data/ai.ts';
import { useCurrentKitchen, useMySettings } from '../../data/hooks.ts';
import { IdeaCard } from '../home/IdeaCard.tsx';
import { IdeaSheet } from '../home/IdeaSheet.tsx';
import { renderMarks, viewOfAiIdea, type IdeaView } from '../home/ideaView.ts';
import { chatKeys, useChatConversation, useLatestChat, useSendChat } from './useChat.ts';

// 全螢幕的對話頁（17〈對話頁〉、03〈和大廚聊聊〉）。
// 進來的方式：首頁的輸入框（開新的一段）或「接著聊」（state.resume，回到 6 小時內同一個廚房的那一段）。
// 送出後整段回應完成才一次出現；失敗時使用者的話留在畫面上，什麼都沒存，可以再送一次。
export type ChatNav = { resume?: boolean } | null;

// iPhone 的鍵盤出現時，版面高度（dvh）不會變，輸入框會被擋住。改成讓對話頁永遠貼著 visualViewport 的可見範圍（17〈對話頁〉）。
// iOS 的 resize 與 scroll 事件不同時到，用事件更新會落後幾格、整頁上下跳，所以用 requestAnimationFrame 每一格直接讀、直接寫（不經過 React）。
// 沒有 visualViewport 的瀏覽器回傳 false，版面用 h-dvh。
function useVisualViewportFit(root: React.RefObject<HTMLDivElement | null>): number | null {
  const [height, setHeight] = useState<number | null>(() => (typeof window === 'undefined' || !window.visualViewport ? null : Math.round(window.visualViewport.height)));
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    let frame = 0;
    let lastH = -1;
    let lastTop = Number.NaN;
    const tick = () => {
      const el = root.current;
      const h = Math.round(v.height);
      const top = Math.round(v.offsetTop);
      if (el && (h !== lastH || top !== lastTop)) {
        el.style.height = `${h}px`;
        el.style.top = `${top}px`;
        if (h !== lastH) setHeight(h);
        lastH = h;
        lastTop = top;
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [root]);
  return height;
}


export function ChatPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const resume = (location.state as ChatNav)?.resume === true;
  const { kitchen, isPending: kitchenPending } = useCurrentKitchen();
  const settings = useMySettings();
  const tempPref = parseTemperaturePref(settings.data?.temperature_unit);
  const latest = useLatestChat();

  // undefined：還在決定要接著聊哪一段；null：新的一段
  const [convId, setConvId] = useState<string | null | undefined>(resume ? undefined : null);
  const [carryFrom, setCarryFrom] = useState<string | null>(null); // 滿 20 輪的那一段：新的一段從它的條件摘要開始
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ text: string; code: AiError } | null>(null);
  const [open, setOpen] = useState<IdeaView | null>(null);
  const send = useSendChat();
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [hint, setHint] = useState<string | null>(null); // 這一輪大廚給的「接著說」提示；只留在這個畫面，重開就沒有
  const rootRef = useRef<HTMLDivElement>(null);
  const vv = useVisualViewportFit(rootRef);

  useEffect(() => {
    if (convId !== undefined || kitchenPending || !latest.isFetched) return;
    const conv = isResumable(latest.data, kitchen?.id) ? latest.data : null;
    if (conv) queryClient.setQueryData(chatKeys.conversation(conv.id), conv);
    setConvId(conv?.id ?? null);
  }, [convId, kitchenPending, kitchen?.id, latest.isFetched, latest.data, queryClient]);

  const conv = useChatConversation(convId ?? null);
  const messages = conv.data?.messages ?? [];
  const full = (conv.data?.turnCount ?? 0) >= CHAT_MAX_TURNS;
  const loading = convId === undefined || (!!convId && conv.isPending);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, pending, failed, full, vv]);
  // 進來、新對話、開新的一段之後，游標回到輸入框
  useEffect(() => {
    if (!full) input.current?.focus();
  }, [full, convId]);

  function back() {
    if ((window.history.state as { idx?: number } | null)?.idx) void navigate(-1);
    else void navigate('/', { replace: true });
  }

  function reset(carry: string | null) {
    setConvId(null);
    setCarryFrom(carry);
    setDraft('');
    setPending(null);
    setFailed(null);
    setHint(null);
    send.reset();
    void navigate('.', { replace: true, state: null });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    sendText(draft.trim());
  }

  function sendText(text: string, wantIdeas = false) {
    if (!text || send.isPending || loading || full) return;
    setFailed(null);
    setHint(null);
    setPending(text);
    setDraft('');
    send.mutate(
      { message: text, ...(wantIdeas ? { wantIdeas: true } : {}), ...(convId ? { conversationId: convId } : carryFrom ? { continueFrom: carryFrom } : {}) },
      {
        onSuccess: (r) => {
          setPending(null);
          if (r.status === 'ok') {
            setConvId(r.conversationId);
            setHint(r.hint);
            setCarryFrom(null);
          } else {
            // 這一段已經滿了（兩台裝置同時送）：重新讀，顯示「開新的一段」
            setDraft(text);
            if (convId) void queryClient.invalidateQueries({ queryKey: chatKeys.conversation(convId) });
          }
        },
        onError: (err) => {
          setPending(null);
          setFailed({ text, code: err instanceof AiCallError ? err.code : 'network' });
          setDraft(text);
        },
      },
    );
  }

  // 最後一則是大廚的、沒有在等回應：選項按鈕（單選點了就送出，多選按「好了」）；還沒給過點子時另外有「直接給我點子」
  const last = messages.at(-1);
  const idle = !loading && !conv.isError && !pending && !failed && !send.isPending && !full;
  const lastAsk = idle && last?.role === 'chef' ? (last.ask ?? null) : null;
  const gaveIdeas = messages.some((m) => m.role === 'chef' && m.suggestionId);
  const showGiveIdeas = !loading && !conv.isError && !full && !gaveIdeas && (messages.length > 0 || !!pending || !!failed);

  const unavailableLine = failed ? intl.formatMessage({ id: failed.code === 'rate_limited' ? 'chat.slowDown' : 'chat.unavailable' }) : '';

  return (
    <div
      ref={rootRef}
      className={`mx-auto flex w-full max-w-[560px] flex-col bg-bg ${vv ? 'fixed inset-x-0' : 'h-dvh'}`}
    >
      <header className="flex h-[52px] flex-none items-center border-b border-line px-2">
        <button
          type="button"
          onClick={back}
          aria-label={intl.formatMessage({ id: 'chat.back' })}
          className="grid h-11 w-11 place-items-center border-0 bg-transparent text-[22px] text-ink"
        >
          ‹
        </button>
        <h1 className="m-0 flex-1 text-center font-round text-[17px] font-bold">
          <FormattedMessage id="chat.title" />
        </h1>
        <button type="button" onClick={() => reset(null)} className="h-11 border-0 bg-transparent px-2.5 font-[inherit] text-[15px] text-ink">
          <FormattedMessage id="chat.new" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4">
        {conv.isError ? (
          <p role="alert" className="m-0 text-caption text-ink-muted">
            <FormattedMessage id="chat.loadError" />
          </p>
        ) : loading ? null : messages.length === 0 && !pending && !failed ? (
          <div className="flex items-start gap-2">
            <Chef size={24} className="flex-none" />
            <p className="m-0 rounded-[4px_14px_14px_14px] bg-chef-soft px-3 py-2.5 font-round text-[16px] leading-normal">
              <FormattedMessage id="chat.empty" />
            </p>
          </div>
        ) : null}

        {messages.map((m) => (
          <Message key={m.id} message={m} conv={conv.data ?? null} tempPref={tempPref} onOpen={setOpen} />
        ))}
        {lastAsk && <Options key={last?.id} ask={lastAsk} onPick={(text) => sendText(text)} />}

        {pending && (
          <>
            <UserBubble text={pending} />
            <div role="status" className="flex items-center gap-2">
              <Chef size={24} mood="thinking" blink className="flex-none" />
              <span className="font-round text-[15px] text-ink-muted">
                <FormattedMessage id="chat.thinking" />
              </span>
            </div>
          </>
        )}
        {failed && (
          <>
            <UserBubble text={failed.text} />
            <div className="flex items-start gap-2">
              <Chef size={24} mood="quiet" className="flex-none" />
              <p role="alert" className="m-0 max-w-[92%] rounded-[4px_14px_14px_14px] bg-chef-soft px-3 py-2.5 font-round text-[16px] leading-normal">
                {unavailableLine}
              </p>
            </div>
          </>
        )}
        {full && (
          <div className="flex items-start gap-2">
            <Chef size={24} className="flex-none" />
            <div className="flex max-w-[92%] flex-col items-start gap-2.5 rounded-[4px_14px_14px_14px] bg-chef-soft px-3 py-2.5 font-round text-[16px] leading-normal">
              <p className="m-0">
                <FormattedMessage id="chat.limit" />
              </p>
              <button
                type="button"
                onClick={() => reset(convId ?? null)}
                className="h-11 rounded-card border-0 bg-bulb px-4 font-[inherit] text-[15px] font-bold text-ink"
              >
                <FormattedMessage id="chat.limit.new" />
              </button>
            </div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      {showGiveIdeas && (
        <div className="flex flex-none justify-end px-3 pt-2">
          <button
            type="button"
            disabled={send.isPending || loading}
            onClick={() => sendText(intl.formatMessage({ id: 'chat.giveIdeas' }), true)}
            className="h-11 rounded-full border border-line bg-bg px-4 font-[inherit] text-[15px] text-ink disabled:opacity-50"
          >
            <FormattedMessage id="chat.giveIdeas" />
          </button>
        </div>
      )}

      {!full && (
        <form onSubmit={submit} className="flex flex-none items-end gap-2 border-t border-line bg-bg px-3 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))]">
          <label className="flex-1">
            <span className="sr-only">
              <FormattedMessage id="chat.messageLabel" />
            </span>
            <textarea
              ref={input}
              rows={1}
              value={draft}
              maxLength={CHAT_MAX_USER_CHARS}
              readOnly={send.isPending}
              onChange={(e) => setDraft(e.target.value)}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
              }}
              placeholder={hint && !lastAsk ? intl.formatMessage({ id: 'chat.placeholderHint' }, { hint }) : intl.formatMessage({ id: 'chat.placeholder' })}
              className="block max-h-36 min-h-11 w-full resize-none rounded-card border-0 bg-surface px-3 py-[11px] font-[inherit] text-[16px] leading-normal text-ink placeholder:text-ink-muted read-only:opacity-60"
            />
          </label>
          <button
            type="submit"
            disabled={!draft.trim() || send.isPending || loading}
            aria-label={intl.formatMessage({ id: 'chat.send' })}
            className="grid h-11 w-11 flex-none place-items-center rounded-full border-0 bg-bulb p-0 text-ink disabled:bg-line"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </form>
      )}

      {open && <IdeaSheet view={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// 大廚的選項：單選點了就送出；多選先勾，按「好了」一起送出。使用者也可以直接在輸入框打字
function Options({ ask, onPick }: { ask: ChatAsk; onPick: (text: string) => void }) {
  const intl = useIntl();
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <div role="group" aria-label={intl.formatMessage({ id: 'chat.optionsLabel' })} className="ml-8 flex flex-col items-start gap-2">
      {ask.multi && (
        <span className="text-caption text-ink-muted">
          <FormattedMessage id="chat.optionsMultiHint" />
        </span>
      )}
      <div className="flex flex-wrap gap-2">
        {ask.options.map((option) => {
          const on = picked.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={ask.multi ? on : undefined}
              onClick={() => (ask.multi ? setPicked((p) => (on ? p.filter((x) => x !== option) : [...p, option])) : onPick(option))}
              className={`min-h-11 rounded-full border px-4 font-[inherit] text-[15px] text-ink ${on ? 'border-bulb bg-bulb' : 'border-line bg-surface'}`}
            >
              {option}
            </button>
          );
        })}
        {ask.multi && (
          <button
            type="button"
            disabled={picked.length === 0}
            onClick={() => onPick(picked.join('、'))}
            className="min-h-11 rounded-full border-0 bg-bulb px-4 font-[inherit] text-[15px] font-bold text-ink disabled:bg-line"
          >
            <FormattedMessage id="chat.optionsDone" />
          </button>
        )}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return <p className="m-0 max-w-[78%] self-end whitespace-pre-wrap rounded-[14px_14px_4px_14px] bg-surface px-3 py-2.5 text-[16px] leading-normal">{text}</p>;
}

function Message({ message, conv, tempPref, onOpen }: {
  message: ChatMessage;
  conv: ChatConversation | null;
  tempPref: ReturnType<typeof parseTemperaturePref>;
  onOpen: (view: IdeaView) => void;
}) {
  const intl = useIntl();
  const ideas = useMemo(
    () => (message.suggestionId ? (conv?.suggestions.get(message.suggestionId) ?? []).map((i) => viewOfAiIdea(i, tempPref, message.suggestionId)) : []),
    [message.suggestionId, conv, tempPref],
  );
  if (message.role === 'user') return <UserBubble text={message.text} />;
  return (
    <>
      <div className="flex max-w-[92%] items-start gap-2">
        <Chef size={24} mood={ideas.length > 0 ? 'idea' : 'normal'} className="flex-none" />
        <div className="rounded-[4px_14px_14px_14px] bg-chef-soft px-3 py-2.5 font-round text-[16px] leading-normal">
          {message.text && <p className="m-0">{renderMarks(message.text, tempPref)}</p>}
          {message.ask && <p className="m-0 mt-1.5">{renderMarks(message.ask.question, tempPref)}</p>}
        </div>
      </div>
      {ideas.length > 0 && (
        <ul aria-label={intl.formatMessage({ id: 'chat.ideasHeading' })} className="m-0 ml-8 flex list-none flex-col gap-2 p-0">
          {ideas.map((view) => (
            <IdeaCard key={view.key} view={view} layout="chat" mentioned={conv?.mentioned ?? []} onOpen={() => onOpen(view)} />
          ))}
        </ul>
      )}
    </>
  );
}
