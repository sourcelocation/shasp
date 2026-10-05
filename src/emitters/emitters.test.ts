import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { TokenSetLoader } from "../token-set.ts";
import { CssEmitter } from "./css.ts";
import { KotlinEmitter } from "./kotlin.ts";
import { SwiftEmitter } from "./swift.ts";
import { TypeScriptEmitter } from "./typescript.ts";

const set = new TokenSetLoader(
  join(resolve(dirname(fileURLToPath(import.meta.url)), "../../testdata"), "tokens"),
).load();

describe("Project names in generated code", () => {
  it("prefixes CSS custom properties and the cssVar() helper alike", () => {
    const css = new CssEmitter({ prefix: "ac" });
    assert.equal(css.outputPath, "dist/tokens.css");
    const out = css.emit(set);
    assert.match(out, /--ac-color-/);
    assert.doesNotMatch(out, /--rd-/);
    assert.match(new TypeScriptEmitter({ prefix: "ac" }).emit(set), /"var\(--ac-color-/);
  });

  it("names the Swift namespace and the Kotlin package and object", () => {
    const swift = new SwiftEmitter({ outputPath: "dist/swift/AcmeTokens.swift", typeName: "AcmeTokens" });
    assert.match(swift.emit(set), /^public enum AcmeTokens \{$/m);
    const kotlin = new KotlinEmitter({
      outputPath: "dist/AcmeTokens.kt",
      packageName: "com.acme.tokens",
      objectName: "AcmeTokens",
    });
    const kt = kotlin.emit(set);
    assert.match(kt, /^package com\.acme\.tokens$/m);
    assert.match(kt, /^object AcmeTokens \{$/m);
  });
});
