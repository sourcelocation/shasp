import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TokenPath } from "./model.ts";
import { TokenRegistry } from "./registry.ts";

describe("TokenRegistry", () => {
  it("inherits $type from ancestor groups and resolves aliases", () => {
    const registry = TokenRegistry.fromDocuments([
      { palette: { $type: "color", ink: { 900: { $value: "#141413" } } } },
      { color: { $type: "color", text: { primary: { $value: "{palette.ink.900}" } } } },
    ] as never);
    const tokens = registry.tokens((p) => p.root === "color");
    assert.equal(tokens.length, 1);
    assert.deepEqual(tokens[0]?.value, { kind: "color", hex: "#141413" });
  });

  it("rejects alias cycles", () => {
    const registry = TokenRegistry.fromDocuments([
      { size: { $type: "dimension", a: { $value: "{size.b}" }, b: { $value: "{size.a}" } } },
    ] as never);
    assert.throws(() => registry.tokens(), /alias cycle/);
  });

  it("rejects aliases that point at a different type", () => {
    const registry = TokenRegistry.fromDocuments([
      {
        palette: { $type: "color", red: { $value: "#FF0000" } },
        size: { $type: "dimension", x: { $value: "{palette.red}" } },
      },
    ] as never);
    assert.throws(() => registry.tokens(), /expected dimension/);
  });

  it("rejects malformed colors", () => {
    const registry = TokenRegistry.fromDocuments([{ palette: { $type: "color", bad: { $value: "red" } } }] as never);
    assert.throws(() => registry.tokens(), /#RRGGBB/);
  });

  it("resolves composite typography including the font role", () => {
    const registry = TokenRegistry.fromDocuments([
      {
        font: {
          family: { $type: "fontFamily", serif: { $value: ["Juana", "serif"] } },
          weight: { $type: "fontWeight", regular: { $value: 400 } },
        },
        text: {
          $type: "typography",
          prompt: {
            $value: {
              fontFamily: "{font.family.serif}",
              fontWeight: "{font.weight.regular}",
              fontSize: "34",
              lineHeight: "42",
            },
          },
        },
      },
    ] as never);
    const [prompt] = registry.tokens((p) => p.root === "text");
    assert.ok(prompt?.value.kind === "typography");
    assert.equal(prompt.value.value.fontRole, "serif");
    assert.equal(prompt.value.value.fontWeight, 400);
    assert.equal(prompt.value.value.letterSpacing, 0);
  });
});

describe("TokenPath", () => {
  it("builds identifiers that are valid in Swift and Kotlin", () => {
    assert.equal(TokenPath.parse("color.bg.accent-subtle").toIdentifier(), "bgAccentSubtle");
    assert.equal(TokenPath.parse("space.4").toIdentifier(), "s4");
  });
});
