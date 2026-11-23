// 呼叫 Claude 的薄包裝（官方 SDK，Deno 用 npm: 引入）。請求格式見 claude-api skill：
// 結構化輸出放 output_config.format、effort 放 output_config.effort、前段 system 加 cache_control。
// 錯誤只留狀態碼；400 另外留 Anthropic 的錯誤類型與訊息前 300 字（訊息描述的是請求格式，例如 schema 哪裡不支援，不含 prompt 與使用者的內容）。
import Anthropic from 'npm:@anthropic-ai/sdk@1.5.0';
import { type ClaudeRequest, type ClaudeResponse, UpstreamError } from './pipeline.ts';

export function createClaude(apiKey: string): (req: ClaudeRequest) => Promise<ClaudeResponse> {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
  return async (req) => {
    try {
      // output_config、thinking 的新格式比 SDK 的型別新，所以用 Record 組好再交給 SDK
      const params: Record<string, unknown> = {
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system.map((s) => ({
          type: 'text',
          text: s.text,
          ...(s.cache ? { cache_control: { type: 'ephemeral' } } : {}),
        })),
        messages: req.messages,
        output_config: { effort: req.effort, format: { type: 'json_schema', schema: req.outputSchema } },
        ...(req.thinking === 'off' ? { thinking: { type: 'disabled' } } : {}),
      };
      // 串流：邊收邊組，收完整段才回傳（App 看到的還是一整段）；不串流的任務照舊一次回應
      const raw = req.stream ? await client.messages.stream(params as never).finalMessage() : await client.messages.create(params as never);
      const message = raw as unknown as {
        model: string;
        stop_reason: string | null;
        content: { type: string; text?: string }[];
        usage: {
          input_tokens: number;
          output_tokens: number;
          cache_read_input_tokens?: number | null;
          cache_creation_input_tokens?: number | null;
        };
      };
      const text = message.content.find((b) => b.type === 'text')?.text ?? '';
      return {
        stopReason: message.stop_reason,
        text,
        model: message.model,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
        },
      };
    } catch (e) {
      if (e instanceof Anthropic.APIError) {
        console.error('ai: claude failed', e.status ?? 'connection');
        if (e.status === 400) console.error('ai: claude 400 detail', JSON.stringify(badRequestDetail(e)));
      } else console.error('ai: claude failed', 'unknown');
      throw new UpstreamError('claude');
    }
  };
}

// 400 的細節：Anthropic 回的 { type: 'error', error: { type, message } }；訊息只截前 300 字
export function badRequestDetail(e: { error?: unknown; message?: string }): { type: string; message: string } {
  const inner = (e.error as { error?: { type?: unknown; message?: unknown } } | undefined)?.error;
  const type = typeof inner?.type === 'string' ? inner.type : 'unknown';
  const message = typeof inner?.message === 'string' ? inner.message : (e.message ?? '');
  return { type, message: [...message].slice(0, 300).join('') };
}
