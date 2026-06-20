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

// a3：把 input_schema 解析为字段列表,供 Playground 按字段动态生成表单控件
// （而非让用户手写整段 JSON）。仅覆盖 v1.0 常见的对象型 Schema；非对象/无 properties
// 返回 null，调用方回退到 JSON 文本域。
export interface SchemaField {
  name: string;
  type: "string" | "number" | "integer" | "boolean" | "enum" | "unknown";
  required: boolean;
  enumValues?: unknown[];
  format?: string;
}

export function schemaFields(schema: unknown): SchemaField[] | null {
  if (!schema || typeof schema !== "object") return null;
  const s = schema as Record<string, unknown>;
  const props = s.properties;
  if (s.type !== "object" || !props || typeof props !== "object") return null;
  const required = Array.isArray(s.required) ? (s.required as string[]) : [];
  const fields: SchemaField[] = [];
  for (const [name, raw] of Object.entries(props as Record<string, unknown>)) {
    const p = (raw ?? {}) as Record<string, unknown>;
    const enumValues = Array.isArray(p.enum) ? (p.enum as unknown[]) : undefined;
    let type: SchemaField["type"] = "unknown";
    if (enumValues && enumValues.length) type = "enum";
    else if (p.type === "string") type = "string";
    else if (p.type === "number") type = "number";
    else if (p.type === "integer") type = "integer";
    else if (p.type === "boolean") type = "boolean";
    fields.push({
      name,
      type,
      required: required.includes(name),
      enumValues,
      format: typeof p.format === "string" ? (p.format as string) : undefined,
    });
  }
  return fields.length ? fields : null;
}
