import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Artwork, BrandExports } from "./exports.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../testdata");

const symbolSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="50" viewBox="0 0 100 50">
<defs><path id="mark" d="M0 0H20V20H0Z M5 5H15V15H5Z"/><path id="unused" d="M0 0H100V50H0Z"/></defs>
<g transform="translate(10 10)" fill-rule="evenodd"><use xlink:href="#mark"/></g>
</svg>`;

describe("Artwork", () => {
  it("keeps the complete symbol export, including definitions, references and transforms", async () => {
    const art = await Artwork.parse("mark", symbolSvg);
    assert.equal(art.width, 100);
    assert.equal(art.height, 50);
    assert.equal(art.svg, symbolSvg);
    assert.equal(art.source, "artwork/exports/mark.svg");
  });

  it("accepts ordinary SVG features and a nonzero viewBox origin", async () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 100 50"><rect x="10" y="20" width="30" height="20" stroke="black" fill="red"/></svg>';
    const art = await Artwork.parse("mark", source);
    assert.equal(art.svg, source);
    assert.deepEqual([art.width, art.height], [100, 50]);
  });
});

describe("BrandExports", () => {
  it("reads the actual Sketch exports without imposing a logo aspect ratio", async () => {
    const brand = await BrandExports.read(root, "Test");
    assert.equal(brand.mark.label, "Test");
    assert.deepEqual([brand.appIcon.width, brand.appIcon.height], [1024, 1024]);
    assert.ok(brand.mark.svg.length > 0 && brand.logo.svg.length > 0);
  });

  it("names the artboard a config forgot to list", () => {
    assert.throws(() => BrandExports.from({}), /list "mark" in the config's artwork/);
  });

  it("keeps the app icon on a 1024 × 1024 canvas", () => {
    const art = (width: number) => new Artwork("app-icon", width, width, symbolSvg);
    assert.throws(() => new BrandExports(art(100), art(516), art(100)), /1024 × 1024 \(found 516 × 516\)/);
  });
});
