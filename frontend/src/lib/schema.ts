// 6.4：Schema 编辑器提交前的客户端合法性校验（JSON + 必须是对象）。
// 后端会再做一次「合法 JSON Schema」的权威校验。

export type SchemaParseResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

export function parseSchemaInput(text: string): SchemaParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "非法 JSON" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Schema 必须是 JSON 对象" };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}
