import {
  type FontRole,
  type ResolvedValue,
  type ShadowLayer,
  type Token,
  TokenError,
  TokenPath,
  type TokenType,
} from "./model.ts";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type JsonObject = Record<string, Json>;

interface RawToken {
  readonly path: TokenPath;
  readonly type: TokenType;
  readonly raw: Json;
  readonly description: string | undefined;
}

const ALIAS = /^\{([^}]+)\}$/;
const TOKEN_TYPES: ReadonlySet<string> = new Set<TokenType>([
  "color",
  "dimension",
  "number",
  "duration",
  "cubicBezier",
  "fontFamily",
  "fontWeight",
  "typography",
  "shadow",
]);

/**
 * Holds raw DTCG documents, flattens them and resolves every alias into a concrete value.
 * Resolution is strict: unknown aliases, cycles, wrong types and malformed values all throw.
 */
export class TokenRegistry {
  private readonly raw = new Map<string, RawToken>();
  private readonly resolved = new Map<string, ResolvedValue>();

  static fromDocuments(documents: readonly JsonObject[]): TokenRegistry {
    const registry = new TokenRegistry();
    for (const doc of documents) registry.add(doc);
    return registry;
  }

  add(document: JsonObject): void {
    this.walk(document, [], undefined);
  }

  /** Every token in declaration order, resolved. */
  tokens(filter?: (path: TokenPath) => boolean): Token[] {
    const out: Token[] = [];
    for (const token of this.raw.values()) {
      if (filter && !filter(token.path)) continue;
      out.push({
        path: token.path,
        type: token.type,
        value: this.resolve(token.path.dotted, []),
        description: token.description,
      });
    }
    return out;
  }

  has(path: string): boolean {
    return this.raw.has(path);
  }

  private walk(node: JsonObject, segments: string[], inheritedType: TokenType | undefined): void {
    const groupType = readType(node, segments) ?? inheritedType;
    if ("$value" in node) {
      const path = new TokenPath(segments);
      if (!groupType) throw new TokenError(path.dotted, "token has no $type (directly or inherited)");
      if (this.raw.has(path.dotted)) throw new TokenError(path.dotted, "token declared twice");
      const description = typeof node.$description === "string" ? node.$description : undefined;
      this.raw.set(path.dotted, { path, type: groupType, raw: node.$value ?? null, description });
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith("$")) continue;
      if (child === null || typeof child !== "object" || Array.isArray(child)) {
        throw new TokenError([...segments, key].join("."), "groups may only contain tokens or groups");
      }
      this.walk(child, [...segments, key], groupType);
    }
  }

  private resolve(path: string, stack: readonly string[]): ResolvedValue {
    const cached = this.resolved.get(path);
    if (cached) return cached;
    if (stack.includes(path)) throw new TokenError(path, `alias cycle: ${[...stack, path].join(" → ")}`);
    const token = this.raw.get(path);
    if (!token) throw new TokenError(stack.at(-1) ?? path, `unknown alias {${path}}`);
    const value = this.parse(token, [...stack, path]);
    this.resolved.set(path, value);
    return value;
  }

  /** Resolves `raw` if it is an alias, asserting the target has the expected type. */
  private deref(raw: Json, expected: TokenType, stack: readonly string[]): ResolvedValue | undefined {
    if (typeof raw !== "string") return undefined;
    const target = ALIAS.exec(raw)?.[1];
    if (target === undefined) return undefined;
    const value = this.resolve(target, stack);
    const targetType = this.raw.get(target)?.type;
    if (targetType !== expected) {
      throw new TokenError(stack.at(-1) ?? target, `alias {${target}} is ${targetType}, expected ${expected}`);
    }
    return value;
  }

  private parse(token: RawToken, stack: readonly string[]): ResolvedValue {
    const aliased = this.deref(token.raw, token.type, stack);
    if (aliased) return aliased;
    const where = token.path.dotted;
    const raw = token.raw;
    switch (token.type) {
      case "color":
        return { kind: "color", hex: parseColor(raw, where) };
      case "dimension":
        return { kind: "dimension", value: parseNumber(raw, where) };
      case "number":
        return { kind: "number", value: parseNumber(raw, where) };
      case "fontWeight":
        return { kind: "fontWeight", value: parseNumber(raw, where) };
      case "duration":
        return { kind: "duration", milliseconds: parseDuration(raw, where) };
      case "cubicBezier":
        return { kind: "cubicBezier", points: parseBezier(raw, where) };
      case "fontFamily":
        return { kind: "fontFamily", role: roleOf(token.path), stack: parseStack(raw, where) };
      case "shadow":
        return { kind: "shadow", layers: parseShadow(raw, where) };
      case "typography":
        return this.parseTypography(raw, where, stack);
    }
  }

  private parseTypography(raw: Json, where: string, stack: readonly string[]): ResolvedValue {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new TokenError(where, "typography must be an object");
    }
    const family = this.deref(raw.fontFamily ?? null, "fontFamily", stack);
    if (family?.kind !== "fontFamily") {
      throw new TokenError(where, "fontFamily must alias a fontFamily token");
    }
    const weightRaw = raw.fontWeight ?? null;
    const weight = this.deref(weightRaw, "fontWeight", stack);
    return {
      kind: "typography",
      value: {
        fontFamily: family.stack,
        fontRole: family.role,
        fontWeight: weight?.kind === "fontWeight" ? weight.value : parseNumber(weightRaw, where),
        fontSize: parseNumber(raw.fontSize ?? null, `${where}.fontSize`),
        lineHeight: parseNumber(raw.lineHeight ?? null, `${where}.lineHeight`),
        letterSpacing: parseNumber(raw.letterSpacing ?? "0", `${where}.letterSpacing`),
      },
    };
  }
}

function readType(node: JsonObject, segments: string[]): TokenType | undefined {
  const type = node.$type;
  if (type === undefined) return undefined;
  if (typeof type !== "string" || !TOKEN_TYPES.has(type)) {
    throw new TokenError(segments.join(".") || "<root>", `unsupported $type ${JSON.stringify(type)}`);
  }
  return type as TokenType;
}

function parseColor(raw: Json, where: string): string {
  if (typeof raw !== "string" || !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(raw)) {
    throw new TokenError(where, `color must be #RRGGBB or #RRGGBBAA, got ${JSON.stringify(raw)}`);
  }
  return raw.toUpperCase();
}

function parseNumber(raw: Json, where: string): number {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value)) throw new TokenError(where, `expected a number, got ${JSON.stringify(raw)}`);
  return value;
}

function parseDuration(raw: Json, where: string): number {
  const match = typeof raw === "string" ? /^(\d+(?:\.\d+)?)ms$/.exec(raw) : null;
  if (!match) throw new TokenError(where, `duration must look like "140ms", got ${JSON.stringify(raw)}`);
  return Number(match[1]);
}

function parseBezier(raw: Json, where: string): [number, number, number, number] {
  if (Array.isArray(raw) && raw.length === 4) {
    const [x1, y1, x2, y2] = raw;
    if (typeof x1 === "number" && typeof y1 === "number" && typeof x2 === "number" && typeof y2 === "number") {
      return [x1, y1, x2, y2];
    }
  }
  throw new TokenError(where, "cubicBezier must be an array of four numbers");
}

function parseStack(raw: Json, where: string): string[] {
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every((s) => typeof s === "string")) {
    throw new TokenError(where, "fontFamily must be a non-empty array of family names");
  }
  return raw;
}

function parseShadow(raw: Json, where: string): ShadowLayer[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new TokenError(where, "shadow must be a non-empty array");
  return raw.map((layer, i) => {
    if (layer === null || typeof layer !== "object" || Array.isArray(layer)) {
      throw new TokenError(`${where}[${i}]`, "shadow layer must be an object");
    }
    return {
      color: parseColor(layer.color ?? null, `${where}[${i}].color`),
      offsetX: parseNumber(layer.offsetX ?? null, `${where}[${i}].offsetX`),
      offsetY: parseNumber(layer.offsetY ?? null, `${where}[${i}].offsetY`),
      blur: parseNumber(layer.blur ?? null, `${where}[${i}].blur`),
      spread: parseNumber(layer.spread ?? "0", `${where}[${i}].spread`),
    };
  });
}

function roleOf(path: TokenPath): FontRole {
  const leaf = path.segments.at(-1);
  if (leaf === "serif" || leaf === "sans" || leaf === "mono") return leaf;
  throw new TokenError(path.dotted, "font families must be named serif, sans or mono");
}
