import type { TokenSet } from "../model.ts";
import { type Emitter, themedPairs } from "./emitter.ts";

/**
 * Emits the semantic colours as plain data, for consumers that have no generator here (a server's
 * transactional email, for instance: email clients cannot read CSS custom properties, so a layout
 * inlines the values).
 */
export class JsonEmitter implements Emitter {
  readonly outputPath: string;

  /** outputPath defaults to `dist/tokens.json`. */
  constructor(outputPath = "dist/tokens.json") {
    this.outputPath = outputPath;
  }

  emit(set: TokenSet): string {
    const colors = themedPairs(set)
      .filter(({ light, dark }) => light.value.kind === "color" && dark.value.kind === "color")
      .map(({ light, dark }) => ({
        name: light.path.segments.slice(1).join("."),
        light: light.value.kind === "color" ? light.value.hex : "",
        dark: dark.value.kind === "color" ? dark.value.hex : "",
      }));
    return `${JSON.stringify({ colors }, null, 2)}\n`;
  }
}
