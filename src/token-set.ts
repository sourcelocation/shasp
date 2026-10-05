import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TokenError, type TokenSet } from "./model.ts";
import { TokenRegistry } from "./registry.ts";

type JsonObject = Record<string, never>;

/**
 * Builds the light/dark token views from the tokens directory.
 *
 * Primitives and foundation are shared; `semantic/color.<theme>.json` provides the themed layer.
 * Product code only ever sees foundation + semantic tokens — primitives stay internal.
 */
export class TokenSetLoader {
  private readonly tokensDir: string;

  constructor(tokensDir: string) {
    this.tokensDir = tokensDir;
  }

  load(): TokenSet {
    const primitives = this.read("primitives/color.json");
    const foundation = this.read("foundation.json");
    const light = TokenRegistry.fromDocuments([primitives, foundation, this.read("semantic/color.light.json")]);
    const dark = TokenRegistry.fromDocuments([primitives, foundation, this.read("semantic/color.dark.json")]);

    const isSemanticColor = (root: string) => root === "color";
    const isFoundation = (root: string) => root !== "color" && root !== "palette";

    const lightColors = light.tokens((p) => isSemanticColor(p.root));
    const darkColors = dark.tokens((p) => isSemanticColor(p.root));
    assertSameKeys(
      lightColors.map((t) => t.path.dotted),
      darkColors.map((t) => t.path.dotted),
    );

    return {
      foundation: light.tokens((p) => isFoundation(p.root)),
      themes: { light: lightColors, dark: darkColors },
    };
  }

  private read(relative: string): JsonObject {
    return JSON.parse(readFileSync(join(this.tokensDir, relative), "utf8")) as JsonObject;
  }
}

function assertSameKeys(light: readonly string[], dark: readonly string[]): void {
  const darkSet = new Set(dark);
  const lightSet = new Set(light);
  const missingInDark = light.filter((k) => !darkSet.has(k));
  const missingInLight = dark.filter((k) => !lightSet.has(k));
  if (missingInDark.length > 0) throw new TokenError("color", `missing in dark theme: ${missingInDark.join(", ")}`);
  if (missingInLight.length > 0) throw new TokenError("color", `missing in light theme: ${missingInLight.join(", ")}`);
  if (light.join("|") !== dark.join("|")) {
    throw new TokenError("color", "light and dark themes must declare tokens in the same order");
  }
}
