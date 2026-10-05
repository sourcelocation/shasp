import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { TokenSetLoader } from "../token-set.ts";
import { appleAssets } from "./apple.ts";
import { androidArtwork, AppIconSvg, ArtworkPng, ArtworkSvg, FaviconSvg, renderArtwork } from "./artwork.ts";
import { Artwork, BrandExports } from "./exports.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../testdata");
const set = new TokenSetLoader(join(root, "tokens")).load();
const source = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><defs><path id="mark" d="M0 0H20V20H0Z M5 5H15V15H5Z"/><rect id="unused" width="100" height="50"/></defs><g transform="translate(10 10)" fill-rule="evenodd"><use href="#mark"/></g></svg>`;
const mark = await Artwork.parse("mark", source);
const icon = new Artwork(
  "app-icon",
  1024,
  1024,
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect x="256" y="256" width="512" height="512"/></svg>',
);
const logo = new Artwork("logo", mark.width, mark.height, source);
const brand = new BrandExports(mark, icon, logo);

/** The parts of Icon Composer's icon.json and an image set's Contents.json the tests read. */
interface IconDocument {
  groups: { layers: { "image-name": string }[] }[];
  "fill-specializations": { value: { solid: string } }[];
}
interface ImageSetContents {
  properties: { "template-rendering-intent": string };
}

async function pixels(input: string | Uint8Array) {
  const { data, info } = await sharp(Buffer.from(input)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    at: (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)],
  };
}

describe("Whole-image rendering", () => {
  it("resolves symbols and transforms while preserving cutouts and ignoring unused definitions", async () => {
    const rendered = await pixels(await renderArtwork(mark, 100, 50, "#FFFFFF"));
    assert.deepEqual(rendered.at(12, 12), [255, 255, 255, 255]);
    assert.equal(rendered.at(20, 20)[3], 0, "the even-odd cutout stays transparent");
    assert.equal(rendered.at(2, 2)[3], 0, "unused definitions are not drawn");
    assert.equal(rendered.at(40, 20)[3], 0, "the translated instance has its original bounds");
  });
});

describe("Android bitmap drawables", () => {
  const assets = androidArtwork("res", brand);
  const asset = (path: string) => {
    const emitter = assets.find((a) => a.outputPath === path);
    assert.ok(emitter, `emits ${path}`);
    return emitter;
  };

  it("renders all five densities with the adaptive icon canvas and padding", async () => {
    for (const [density, scale] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
      const rendered = await pixels(await asset(`res/drawable-${density}/ic_launcher_foreground.png`).emit(set));
      assert.deepEqual([rendered.width, rendered.height], [108 * scale, 108 * scale]);
      assert.equal(rendered.at(0, 0)[3], 0);
      assert.deepEqual(rendered.at(Math.round(54 * scale), Math.round(54 * scale)), [0, 0, 0, 255]);
      assert.equal(rendered.at(Math.round(30 * scale), Math.round(54 * scale))[3], 0);
    }
  });

  it("uses white alpha for themed and notification icons and the dark splash", async () => {
    for (const path of ["res/drawable-mdpi/ic_launcher_monochrome.png", "res/drawable-night-mdpi/ic_splash.png"]) {
      const rendered = await pixels(await asset(path).emit(set));
      assert.deepEqual(rendered.at(54, 54), [255, 255, 255, 255]);
    }
    const notification = await pixels(await asset("res/drawable-xxxhdpi/ic_notification.png").emit(set));
    assert.deepEqual([notification.width, notification.height], [96, 96]);
    assert.equal(notification.at(0, 0)[3], 0);
  });

  it("preserves the logo canvas proportions", async () => {
    const rendered = await pixels(await asset("res/drawable-xhdpi/ic_logo.png").emit(set));
    assert.deepEqual([rendered.width, rendered.height], [128, 64]);
  });
});

describe("Web artwork composition", () => {
  it("copies the source SVG unchanged", () => {
    assert.equal(new ArtworkSvg("mark.svg", mark, "light").emit(set), source);
  });

  it("colours the complete image for dark and currentColor appearances", async () => {
    const dark = new ArtworkSvg("mark-on-dark.svg", mark, "dark").emit(set);
    const rendered = await pixels(dark);
    assert.deepEqual(rendered.at(12, 12), [255, 255, 255, 255]);
    assert.equal(rendered.at(20, 20)[3], 0);
    const mono = new ArtworkSvg("mark-mono.svg", mark, "currentColor")
      .emit(set)
      .replace("<svg ", '<svg color="#FF0000" ');
    assert.deepEqual((await pixels(mono)).at(12, 12), [255, 0, 0, 255]);
  });

  it("composes paper behind the complete app icon and a square appearance-aware favicon", async () => {
    const rendered = await pixels(new AppIconSvg("icon.svg", icon).emit(set));
    assert.deepEqual(rendered.at(0, 0), [242, 239, 231, 255]);
    assert.deepEqual(rendered.at(512, 512), [0, 0, 0, 255]);
    const favicon = new FaviconSvg("favicon.svg", mark).emit(set);
    assert.match(favicon, /viewBox="0 -25 100 100"/);
    assert.match(favicon, /prefers-color-scheme:dark/);
  });
});

describe("Apple assets", () => {
  const assets = appleAssets("Assets.xcassets", "AppIcon.icon", brand);
  const emitted = async (path: string) => {
    const emitter = assets.find((a) => a.outputPath === path);
    assert.ok(emitter, `emits ${path}`);
    return String(await emitter.emit(set));
  };

  it("copies complete SVGs into the template images and Icon Composer layer", async () => {
    assert.equal(await emitted("Assets.xcassets/Mark.imageset/Mark.svg"), mark.svg);
    assert.equal(await emitted("Assets.xcassets/Logo.imageset/Logo.svg"), logo.svg);
    assert.equal(await emitted("AppIcon.icon/Assets/Mark.svg"), icon.svg);
    const document = JSON.parse(await emitted("AppIcon.icon/icon.json")) as IconDocument;
    assert.equal(document.groups[0]?.layers[0]?.["image-name"], "Mark.svg");
    assert.deepEqual(
      document["fill-specializations"].map((s) => s.value.solid),
      ["srgb:0.94902,0.93725,0.90588,1.00000", "srgb:0.05098,0.05098,0.04706,1.00000"],
    );
    for (const name of ["Mark", "Logo"]) {
      const contents = JSON.parse(await emitted(`Assets.xcassets/${name}.imageset/Contents.json`)) as ImageSetContents;
      assert.equal(contents.properties["template-rendering-intent"], "template");
    }
  });
});

describe("Generic PNGs", () => {
  it("renders on a transparent canvas unless a background is given", async () => {
    const bare = await pixels(
      await new ArtworkPng("a.png", mark, { width: 100, height: 50, paint: "light" }).emit(set),
    );
    assert.equal(bare.at(2, 2)[3], 0);
    const avatar = await new ArtworkPng("b.png", mark, {
      width: 100,
      height: 50,
      paint: "#FF0000",
      background: "light",
    }).emit(set);
    const rendered = await pixels(avatar);
    assert.deepEqual(rendered.at(2, 2), [242, 239, 231, 255], "the light paper fills the canvas");
    assert.deepEqual(rendered.at(12, 12), [255, 0, 0, 255], "the artwork keeps its paint");
  });
});

describe("Labels", () => {
  it("names composed images after the brand, escaped", () => {
    const named = new Artwork("mark", mark.width, mark.height, source, 'A & "B"');
    const svg = new ArtworkSvg("mark-mono.svg", named, "currentColor").emit(set);
    assert.match(svg, /aria-label="A &amp; &quot;B&quot;"><title>A &amp; &quot;B&quot;<\/title>/);
  });
});
