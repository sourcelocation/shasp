import type { ResolvedValue, Token, TokenSet } from "../model.ts";
import { cssVarNameWith } from "./css.ts";
import { type Emitter, GENERATED_NOTICE, themedPairs } from "./emitter.ts";

/**
 * Emits a typed constant tree plus a `cssVar()` helper whose argument is a union of every
 * token path — so referencing a non-existent token is a compile error, not a silent fallback.
 */
export interface TypeScriptOptions {
  /** Default `dist/tokens.ts`. */
  readonly outputPath?: string;
  /** The CSS custom property prefix `cssVar()` resolves to; the same as the CSS emitter's. */
  readonly prefix: string;
}

export class TypeScriptEmitter implements Emitter {
  readonly outputPath: string;
  private readonly prefix: string;

  constructor(options: TypeScriptOptions) {
    this.outputPath = options.outputPath ?? "dist/tokens.ts";
    this.prefix = options.prefix;
  }

  emit(set: TokenSet): string {
    const pairs = themedPairs(set);
    const tree: Record<string, unknown> = {};
    for (const token of set.foundation) assign(tree, token.path.segments, plain(token.value));
    const color: Record<string, unknown> = {};
    for (const { light, dark } of pairs) {
      assign(color, light.path.withoutRoot(), { light: plain(light.value), dark: plain(dark.value) });
    }
    tree.color = color;

    const vars = [...set.foundation, ...pairs.map((p) => p.light)];
    const varMap = Object.fromEntries(vars.map((t) => [t.path.dotted, `var(${cssVarNameWith(t, this.prefix)})`]));
    return [
      `// ${GENERATED_NOTICE}`,
      "",
      `export const tokens = ${JSON.stringify(tree, null, 2)} as const;`,
      "",
      `const cssVars = ${JSON.stringify(varMap, null, 2)} as const;`,
      "",
      "export type TokenPath = keyof typeof cssVars;",
      "",
      `/** \`var(--${this.prefix}-…)\` reference for a token path. Prefer this over hand-written custom properties. */`,
      "export function cssVar<P extends TokenPath>(path: P): (typeof cssVars)[P] {",
      "  return cssVars[path];",
      "}",
      "",
    ].join("\n");
  }
}

function plain(v: ResolvedValue): unknown {
  switch (v.kind) {
    case "color":
      return v.hex;
    case "dimension":
    case "number":
    case "fontWeight":
      return v.value;
    case "duration":
      return v.milliseconds;
    case "cubicBezier":
      return v.points;
    case "fontFamily":
      return v.stack;
    case "shadow":
      return v.layers;
    case "typography":
      return v.value;
  }
}

function assign(tree: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let node = tree;
  path.forEach((segment, i) => {
    if (i === path.length - 1) {
      node[segment] = value;
      return;
    }
    node[segment] ??= {};
    node = node[segment] as Record<string, unknown>;
  });
}

export type { Token };
