import type { Token, TokenSet } from "../model.ts";
import {
  argbLiteral,
  type Emitter,
  formatNumber,
  GENERATED_NOTICE,
  groupByRoot,
  memberName,
  themedPairs,
  upperFirst,
} from "./emitter.ts";

/**
 * Emits a dependency-free Kotlin object tree. Values are plain data (ARGB Longs, Floats, Ints);
 * the hand-written Compose theme maps them onto `Color`, `TextStyle`, `Dp` and `sp`.
 */
export interface KotlinOptions {
  readonly outputPath: string;
  /** The package of the generated file, e.g. `com.acme.designsystem.generated`. */
  readonly packageName: string;
  /** The generated object, e.g. `AcmeTokens`. */
  readonly objectName: string;
}

export class KotlinEmitter implements Emitter {
  readonly outputPath: string;
  private readonly packageName: string;
  private readonly objectName: string;

  constructor(options: KotlinOptions) {
    this.outputPath = options.outputPath;
    this.packageName = options.packageName;
    this.objectName = options.objectName;
  }

  emit(set: TokenSet): string {
    const out: string[] = [
      `// ${GENERATED_NOTICE}`,
      '@file:Suppress("MagicNumber", "unused")',
      "",
      `package ${this.packageName}`,
      "",
      "data class ThemedColor(val light: Long, val dark: Long)",
      "",
      "enum class FontRole { Serif, Sans, Mono }",
      "",
      "data class TextStyleToken(",
      "    val role: FontRole,",
      "    val weight: Int,",
      "    val size: Float,",
      "    val lineHeight: Float,",
      "    val tracking: Float,",
      ")",
      "",
      "data class ShadowLayerToken(val color: Long, val x: Float, val y: Float, val blur: Float, val spread: Float)",
      "",
      "data class EasingToken(val x1: Float, val y1: Float, val x2: Float, val y2: Float)",
      "",
      `object ${this.objectName} {`,
      "    object Color {",
    ];
    for (const { light, dark } of themedPairs(set)) {
      if (light.value.kind !== "color" || dark.value.kind !== "color") continue;
      out.push(
        `        val ${memberName(light)} = ThemedColor(light = ${argbLiteral(light.value.hex)}, dark = ${argbLiteral(dark.value.hex)})`,
      );
    }
    out.push("    }");

    for (const [root, tokens] of groupByRoot(set.foundation)) {
      const members = tokens.map((t) => this.member(t)).filter((m): m is string => m !== undefined);
      if (members.length === 0) continue;
      out.push("", `    object ${upperFirst(root)} {`, ...members.map((m) => `        ${m}`), "    }");
    }
    out.push("}", "");
    return out.join("\n");
  }

  private member(token: Token): string | undefined {
    const name = memberName(token);
    const v = token.value;
    switch (v.kind) {
      case "dimension":
      case "number":
        return `const val ${name}: Float = ${float(v.value)}`;
      case "duration":
        return `const val ${name}: Int = ${formatNumber(v.milliseconds)}`;
      case "fontWeight":
        return `const val ${name}: Int = ${formatNumber(v.value)}`;
      case "cubicBezier": {
        const [x1, y1, x2, y2] = v.points.map(float);
        return `val ${name} = EasingToken(${x1}, ${y1}, ${x2}, ${y2})`;
      }
      case "typography": {
        const t = v.value;
        return `val ${name} = TextStyleToken(FontRole.${upperFirst(t.fontRole)}, ${t.fontWeight}, ${float(t.fontSize)}, ${float(t.lineHeight)}, ${float(t.letterSpacing)})`;
      }
      case "shadow": {
        const layers = v.layers.map(
          (l) =>
            `ShadowLayerToken(${argbLiteral(l.color)}, ${float(l.offsetX)}, ${float(l.offsetY)}, ${float(l.blur)}, ${float(l.spread)})`,
        );
        return `val ${name} = listOf(${layers.join(", ")})`;
      }
      case "fontFamily":
      case "color":
        return undefined;
    }
  }
}

function float(n: number): string {
  return `${formatNumber(n)}${Number.isInteger(n) ? ".0" : ""}f`;
}
