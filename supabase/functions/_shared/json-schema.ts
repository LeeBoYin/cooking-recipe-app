// 小型 JSON Schema 驗證：只支援結構化輸出會用到的子集（type、properties、required、additionalProperties、
// items、enum、const、min／max 長度與數值、anyOf）。不用 ajv：它靠 new Function 產生程式，在 Edge Runtime 不保證能跑。
// 遇到不認得的關鍵字就當作驗證失敗，免得悄悄放行。

export type JsonSchema = { readonly [key: string]: unknown };

const SUPPORTED = new Set([
  'type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const',
  'minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'anyOf', 'description', 'title',
]);

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function matchesType(v: unknown, t: string): boolean {
  const actual = typeOf(v);
  return actual === t || (t === 'number' && actual === 'integer');
}

// 回傳錯誤路徑的清單（只有位置，不含值，免得把使用者內容寫進紀錄）
export function validate(schema: JsonSchema, value: unknown, path = '$'): string[] {
  for (const key of Object.keys(schema)) if (!SUPPORTED.has(key)) return [`${path}: unsupported keyword ${key}`];

  if (Array.isArray(schema.anyOf)) {
    const ok = (schema.anyOf as JsonSchema[]).some((s) => validate(s, value, path).length === 0);
    return ok ? [] : [`${path}: anyOf`];
  }
  const errors: string[] = [];
  const t = schema.type;
  if (t !== undefined) {
    const types = Array.isArray(t) ? (t as string[]) : [t as string];
    if (!types.some((x) => matchesType(value, x))) return [`${path}: type`];
  }
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) errors.push(`${path}: const`);
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) errors.push(`${path}: enum`);

  if (typeof value === 'string') {
    const len = [...value].length;
    if (typeof schema.minLength === 'number' && len < schema.minLength) errors.push(`${path}: minLength`);
    if (typeof schema.maxLength === 'number' && len > schema.maxLength) errors.push(`${path}: maxLength`);
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${path}: minimum`);
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${path}: maximum`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) errors.push(`${path}: minItems`);
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errors.push(`${path}: maxItems`);
    if (schema.items && typeof schema.items === 'object') {
      value.forEach((item, i) => errors.push(...validate(schema.items as JsonSchema, item, `${path}[${i}]`)));
    }
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
    for (const key of (schema.required as string[] | undefined) ?? []) {
      if (!(key in obj)) errors.push(`${path}.${key}: required`);
    }
    for (const [key, v] of Object.entries(obj)) {
      if (key in props) errors.push(...validate(props[key], v, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${key}: additionalProperties`);
      else if (typeof schema.additionalProperties === 'object' && schema.additionalProperties !== null) {
        errors.push(...validate(schema.additionalProperties as JsonSchema, v, `${path}.${key}`));
      }
    }
  }
  return errors;
}
