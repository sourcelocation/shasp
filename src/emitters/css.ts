import type { ResolvedValue, Token, TokenSet } from "../model.ts";
import { type Emitter, formatNumber, GENERATED_NOTICE, themedPairs } from "./emitter.ts";

export interface CssOptions {
  /** Default `dist/tokens.css`. */
  readonly outputPath?: string;
  /** Namespaces every custom property and utility class: `--<prefix>-…`, `.<prefix>-text-…`. */
  readonly prefix: string;
}

/**
 * Emits CSS custom properties. Colors switch with `prefers-color-scheme`, overridable by
 * `data-theme="light|dark"` on the root element. Typography tokens emit a `font` shorthand
 * plus a separate letter-spacing variable, and a `.<prefix>-text-*` utility class each.
 */
export class CssEmitter implements Emitter {
  readonly outputPath: string;
  private readonly prefix: string;

  constructor(options: CssOptions) {
    this.outputPath = options.outputPath ?? "dist/tokens.css";
    this.prefix = options.prefix;
  }

  emit(set: TokenSet): string {
    const pairs = themedPairs(set);
    const lines: string[] = [`/* ${GENERATED_NOTICE} */`, "", ":root {"];
    for (const token of set.foundation) lines.push(...this.declarations(token));
    for (const { light } of pairs) lines.push(`  ${this.varName(light)}: ${this.value(light.value)};`);
    lines.push("  color-scheme: light dark;", "}", "");

    const dark = pairs.map(({ dark: d }) => `  ${this.varName(d)}: ${this.value(d.value)};`);
    lines.push("@media (prefers-color-scheme: dark) {", '  :root:not([data-theme="light"]) {');
    lines.push(...dark.map((l) => `  ${l}`), "  }", "}", "");
    lines.push(':root[data-theme="dark"] {', ...dark, "  color-scheme: dark;", "}", "");
    lines.push(':root[data-theme="light"] {', "  color-scheme: light;", "}", "");

    for (const token of set.foundation.filter((t) => t.value.kind === "typography")) {
      const name = token.path.withoutRoot().join("-");
      lines.push(
        `.${this.prefix}-text-${name} {`,
        `  font: var(--${this.prefix}-text-${name});`,
        `  letter-spacing: var(--${this.prefix}-text-${name}-tracking);`,
        "}",
      );
    }
    return `${lines.join("\n")}\n`;
  }

  private varName(token: Token): string {
    return cssVarNameWith(token, this.prefix);
  }

  private declarations(token: Token): string[] {
    const name = this.varName(token);
    const v = token.value;
    if (v.kind === "typography") {
      const t = v.value;
      return [
        `  ${name}: ${t.fontWeight} ${px(t.fontSize)}/${px(t.lineHeight)} var(--${this.prefix}-font-family-${t.fontRole});`,
        `  ${name}-tracking: ${px(t.letterSpacing)};`,
      ];
    }
    return [`  ${name}: ${this.value(v)};`];
  }

  private value(v: ResolvedValue): string {
    switch (v.kind) {
      case "color":
        return v.hex;
      case "dimension":
        return v.value >= 9999 ? "9999px" : px(v.value);
      case "number":
      case "fontWeight":
        return formatNumber(v.value);
      case "duration":
        return `${formatNumber(v.milliseconds)}ms`;
      case "cubicBezier":
        return `cubic-bezier(${v.points.map(formatNumber).join(", ")})`;
      case "fontFamily":
        return v.stack.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(", ");
      case "shadow":
        return v.layers
          .map((l) => `${px(l.offsetX)} ${px(l.offsetY)} ${px(l.blur)} ${px(l.spread)} ${l.color}`)
          .join(", ");
      case "typography":
        throw new Error("typography is expanded by declarations()");
    }
  }
}

/** The custom property of a token: `--<prefix>-<kebab path>`. */
export function cssVarNameWith(token: Token, prefix: string): string {
  return `--${prefix}-${token.path.toKebab()}`;
}

function px(n: number): string {
  return n === 0 ? "0" : `${formatNumber(n)}px`;
}
