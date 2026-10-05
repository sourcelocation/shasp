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
 * Emits a Foundation-only Swift namespace. Values are plain data (ARGB integers, Doubles);
 * the hand-written DesignSystem module maps them onto SwiftUI types.
 */
export interface SwiftOptions {
  readonly outputPath: string;
  /** The generated namespace, e.g. `AcmeTokens`. */
  readonly typeName: string;
}

export class SwiftEmitter implements Emitter {
  readonly outputPath: string;
  private readonly typeName: string;

  constructor(options: SwiftOptions) {
    this.outputPath = options.outputPath;
    this.typeName = options.typeName;
  }

  emit(set: TokenSet): string {
    const out: string[] = [
      `// ${GENERATED_NOTICE}`,
      "// swiftlint:disable all",
      "",
      "import Foundation",
      "",
      `public enum ${this.typeName} {`,
      "    public struct ThemedColor: Sendable, Hashable {",
      "        public let light: UInt32",
      "        public let dark: UInt32",
      "    }",
      "",
      "    public enum FontRole: Sendable { case serif, sans, mono }",
      "",
      "    public struct TextStyle: Sendable, Hashable {",
      "        public let role: FontRole",
      "        public let weight: Int",
      "        public let size: Double",
      "        public let lineHeight: Double",
      "        public let tracking: Double",
      "    }",
      "",
      "    public struct ShadowLayer: Sendable, Hashable {",
      "        public let color: UInt32",
      "        public let x: Double",
      "        public let y: Double",
      "        public let blur: Double",
      "        public let spread: Double",
      "    }",
      "",
      "    public struct Easing: Sendable, Hashable {",
      "        public let x1: Double",
      "        public let y1: Double",
      "        public let x2: Double",
      "        public let y2: Double",
      "    }",
      "",
      "    public enum Color {",
    ];
    for (const { light, dark } of themedPairs(set)) {
      if (light.value.kind !== "color" || dark.value.kind !== "color") continue;
      out.push(
        `        public static let ${memberName(light)} = ThemedColor(light: ${argbLiteral(light.value.hex)}, dark: ${argbLiteral(dark.value.hex)})`,
      );
    }
    out.push("    }");

    for (const [root, tokens] of groupByRoot(set.foundation)) {
      const members = tokens.map((t) => this.member(t)).filter((m): m is string => m !== undefined);
      if (members.length === 0) continue;
      out.push("", `    public enum ${upperFirst(root)} {`, ...members.map((m) => `        ${m}`), "    }");
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
        return `public static let ${name}: Double = ${formatNumber(v.value)}`;
      case "duration":
        return `public static let ${name}: Double = ${formatNumber(v.milliseconds / 1000)}`;
      case "cubicBezier": {
        const [x1, y1, x2, y2] = v.points.map(formatNumber);
        return `public static let ${name} = Easing(x1: ${x1}, y1: ${y1}, x2: ${x2}, y2: ${y2})`;
      }
      case "typography": {
        const t = v.value;
        return `public static let ${name} = TextStyle(role: .${t.fontRole}, weight: ${t.fontWeight}, size: ${formatNumber(t.fontSize)}, lineHeight: ${formatNumber(t.lineHeight)}, tracking: ${formatNumber(t.letterSpacing)})`;
      }
      case "shadow": {
        const layers = v.layers.map(
          (l) =>
            `ShadowLayer(color: ${argbLiteral(l.color)}, x: ${formatNumber(l.offsetX)}, y: ${formatNumber(l.offsetY)}, blur: ${formatNumber(l.blur)}, spread: ${formatNumber(l.spread)})`,
        );
        return `public static let ${name}: [ShadowLayer] = [${layers.join(", ")}]`;
      }
      case "fontWeight":
        return `public static let ${name}: Int = ${formatNumber(v.value)}`;
      case "fontFamily":
      case "color":
        return undefined;
    }
  }
}
