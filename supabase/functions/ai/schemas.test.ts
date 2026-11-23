// 每個任務送給 Claude 的結構化輸出 schema，不能含 Anthropic 不支援的關鍵字（否則整個請求回 400）。
// 官方文件（structured outputs，JSON Schema 的限制）：不支援數值限制（minimum、maximum、multipleOf）、
// 字串限制（minLength、maxLength）、minItems 只能 0 或 1（maxItems 也算不支援）、oneOf、not、遞迴、
// 與 type／properties 放在同一層的 anyOf、additionalProperties 以外的值。這些限制改由各任務的 check.ts 或輸出驗證做。
import { assert } from 'jsr:@std/assert@1';
import type { JsonSchema } from '../_shared/json-schema.ts';
import { buildChatSchema } from './chat/prompt.ts';
import { buildExpandSchema } from './expand/prompt.ts';
import { buildHomeSchema } from './home/prompt.ts';
import { TASKS } from './tasks.ts';
import { badRequestDetail } from './claude.ts';

const FORBIDDEN = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems', 'uniqueItems', 'oneOf', 'not', 'patternProperties', 'minProperties', 'maxProperties', '$ref', '$defs', 'definitions'];

export function unsupported(schema: unknown, path = '$'): string[] {
  if (typeof schema !== 'object' || schema === null) return [];
  const s = schema as Record<string, unknown>;
  const out: string[] = [];
  for (const k of FORBIDDEN) if (k in s) out.push(`${path}: ${k}`);
  if (typeof s.minItems === 'number' && s.minItems > 1) out.push(`${path}: minItems ${s.minItems}`);
  if (s.type === 'object' && s.additionalProperties !== false) out.push(`${path}: object 要 additionalProperties: false`);
  if ('anyOf' in s && ('type' in s || 'properties' in s)) out.push(`${path}: anyOf 不能和 type／properties 同一層`);
  for (const [k, v] of Object.entries(s)) {
    if (k === 'properties' && typeof v === 'object' && v) for (const [pk, pv] of Object.entries(v)) out.push(...unsupported(pv, `${path}.${pk}`));
    else if (k === 'items') out.push(...unsupported(v, `${path}[]`));
    else if (k === 'anyOf' && Array.isArray(v)) v.forEach((x, i) => out.push(...unsupported(x, `${path}|${i}`)));
  }
  return out;
}

Deno.test('每個任務的輸出 schema 都沒有 Claude 不支援的關鍵字', () => {
  const schemas: [string, JsonSchema][] = [
    ['chat', buildChatSchema()],
    ['home_ideas', buildHomeSchema()],
    ['expand_steps', buildExpandSchema()],
    ...Object.entries(TASKS).map(([name, def]): [string, JsonSchema] => [name, def!.outputSchema]),
  ];
  assert(schemas.length >= 5);
  for (const [name, schema] of schemas) {
    const problems = unsupported(schema);
    assert(problems.length === 0, `${name}: ${problems.join('；')}`);
  }
});

Deno.test('檢查器本身抓得到不支援的關鍵字', () => {
  assert(unsupported({ type: 'array', items: { type: 'integer', minimum: 0 }, maxItems: 3 }).length === 2);
  assert(unsupported({ type: 'array', items: { type: 'string' }, minItems: 2 }).length === 1);
  assert(unsupported({ type: 'array', items: { type: 'string' }, minItems: 1 }).length === 0);
  assert(unsupported({ type: 'object', properties: {} }).length === 1);
});

Deno.test('400 的細節：類型與訊息，訊息只留前 300 字', () => {
  const long = 'x'.repeat(500);
  const d = badRequestDetail({ error: { type: 'error', error: { type: 'invalid_request_error', message: long } } });
  assert(d.type === 'invalid_request_error' && [...d.message].length === 300);
  assert(badRequestDetail({ message: 'boom' }).type === 'unknown');
});
