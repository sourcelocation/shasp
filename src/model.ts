/**
 * Domain model of the design-token compiler.
 *
 * Tokens follow the W3C Design Tokens Community Group (DTCG) format: groups are plain objects,
 * tokens are objects with a `$value`, and `$type` is inherited from the closest ancestor group.
 */

export type TokenType =
  "color" | "dimension" | "number" | "duration" | "cubicBezier" | "fontFamily" | "fontWeight" | "typography" | "shadow";

export interface ShadowLayer {
  readonly color: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blur: number;
  readonly spread: number;
}

export interface Typography {
  readonly fontFamily: readonly string[];
  readonly fontRole: FontRole;
  readonly fontWeight: number;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
}

export type FontRole = "serif" | "sans" | "mono";

/** A fully resolved token value — no aliases left. */
export type ResolvedValue =
  | { readonly kind: "color"; readonly hex: string }
  | { readonly kind: "dimension"; readonly value: number }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "duration"; readonly milliseconds: number }
  | { readonly kind: "cubicBezier"; readonly points: readonly [number, number, number, number] }
  | { readonly kind: "fontFamily"; readonly role: FontRole; readonly stack: readonly string[] }
  | { readonly kind: "fontWeight"; readonly value: number }
  | { readonly kind: "typography"; readonly value: Typography }
  | { readonly kind: "shadow"; readonly layers: readonly ShadowLayer[] };

export class TokenPath {
  readonly segments: readonly string[];
  /** The group the path starts in, e.g. `color` for `color.bg.canvas`. */
  readonly root: string;

  constructor(segments: readonly string[]) {
    const [root] = segments;
    if (root === undefined) throw new Error("A token path needs at least one segment");
    this.segments = segments;
    this.root = root;
  }

  static parse(dotted: string): TokenPath {
    return new TokenPath(dotted.split("."));
  }

  get dotted(): string {
    return this.segments.join(".");
  }

  /** Path without its root group, e.g. `color.bg.canvas` → `bg.canvas`. */
  withoutRoot(): readonly string[] {
    return this.segments.slice(1);
  }

  toKebab(): string {
    return this.segments.join("-");
  }

  /** camelCase identifier for Swift/Kotlin; numeric leading segments are prefixed with `s`. */
  toIdentifier(dropRoot = true): string {
    const parts = dropRoot ? this.withoutRoot() : this.segments;
    const words = parts.flatMap((p) => p.split("-"));
    const ident = words.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join("");
    return /^[0-9]/.test(ident) ? `s${ident}` : ident;
  }
}

export interface Token {
  readonly path: TokenPath;
  readonly type: TokenType;
  readonly value: ResolvedValue;
  readonly description: string | undefined;
}

/** A theme-independent token plus the per-theme semantic colors. */
export interface TokenSet {
  readonly foundation: readonly Token[];
  readonly themes: { readonly light: readonly Token[]; readonly dark: readonly Token[] };
}

export class TokenError extends Error {
  constructor(path: string, message: string) {
    super(`[${path}] ${message}`);
    this.name = "TokenError";
  }
}
