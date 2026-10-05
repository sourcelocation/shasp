import type { Emitter } from "../emitters/emitter.ts";
import type { TokenSet } from "../model.ts";
import { BrandColors } from "./artwork.ts";
import type { Artwork, BrandExports } from "./exports.ts";

/** JSON as Xcode writes it in asset catalogs and Icon Composer documents. */
function xcodeJson(body: object): string {
  return `${JSON.stringify(body, null, 2).replace(/": /g, '" : ')}\n`;
}

/** `#RRGGBB` → a colour of an Icon Composer document (`srgb:r,g,b,a`). */
function iconColor(hex: string): string {
  const channel = (i: number) => (Number.parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(5);
  return `srgb:${channel(1)},${channel(3)},${channel(5)},1.00000`;
}

/** `#RRGGBB` → an asset catalog sRGB colour. */
function catalogColor(hex: string): object {
  const component = (i: number) => `0x${hex.slice(i, i + 2).toUpperCase()}`;
  return {
    "color-space": "srgb",
    components: { red: component(1), green: component(3), blue: component(5), alpha: "1.000" },
  };
}

function colorSet(light: string, dark: string): object {
  return {
    colors: [
      { color: catalogColor(light), idiom: "universal" },
      { appearances: [{ appearance: "luminosity", value: "dark" }], color: catalogColor(dark), idiom: "universal" },
    ],
    info: { author: "xcode", version: 1 },
  };
}

class Json implements Emitter {
  readonly outputPath: string;
  private readonly body: (set: TokenSet) => object;

  constructor(outputPath: string, body: (set: TokenSet) => object) {
    this.outputPath = outputPath;
    this.body = body;
  }

  emit(set: TokenSet): string {
    return xcodeJson(this.body(set));
  }
}

/** Apple consumes the complete authored SVG for template images and Icon Composer layers. */
class SvgCopy implements Emitter {
  readonly outputPath: string;
  private readonly art: Artwork;

  constructor(outputPath: string, art: Artwork) {
    this.outputPath = outputPath;
    this.art = art;
  }

  emit(): string {
    return this.art.svg;
  }
}

/** An image set holding one template image (SwiftUI colours it with `foregroundStyle`). */
function templateImage(catalog: string, name: string, art: Artwork): Emitter[] {
  return [
    new SvgCopy(`${catalog}/${name}.imageset/${name}.svg`, art),
    new Json(`${catalog}/${name}.imageset/Contents.json`, () => ({
      images: [{ filename: `${name}.svg`, idiom: "universal" }],
      info: { author: "xcode", version: 1 },
      properties: { "preserves-vector-representation": true, "template-rendering-intent": "template" },
    })),
  ];
}

/**
 * The app icon as an Icon Composer document: the brand paper with the mark as one glass layer, in
 * ink on paper — and the reverse in the dark appearance. Xcode renders every appearance (tinted and
 * clear too) and the flat images older systems use.
 */
function iconDocument(path: string, icon: Artwork): Emitter[] {
  return [
    new SvgCopy(`${path}/Assets/Mark.svg`, icon),
    new Json(`${path}/icon.json`, (set) => {
      const light = BrandColors.of(set, "light");
      const dark = BrandColors.of(set, "dark");
      const solid = (hex: string) => ({ solid: iconColor(hex) });
      return {
        "fill-specializations": [{ value: solid(light.paper) }, { appearance: "dark", value: solid(dark.paper) }],
        groups: [
          {
            layers: [
              {
                "fill-specializations": [{ value: solid(light.ink) }, { appearance: "dark", value: solid(dark.ink) }],
                glass: true,
                "image-name": "Mark.svg",
                name: "Mark",
              },
            ],
            shadow: { kind: "neutral", opacity: 0.5 },
            specular: true,
            translucency: { enabled: false, value: 0.5 },
          },
        ],
        "supported-platforms": { squares: "shared" },
      };
    }),
  ];
}

/**
 * The Apple apps' generated assets: the app icon ([iconPath], an Icon Composer document), the mark
 * and the logo as template images, and the colours the system shows before SwiftUI draws (the
 * accent and the launch screen's canvas).
 */
export function appleAssets(catalog: string, iconPath: string, brand: BrandExports): Emitter[] {
  return [
    ...iconDocument(iconPath, brand.appIcon),
    new Json(`${catalog}/Contents.json`, () => ({ info: { author: "xcode", version: 1 } })),
    ...templateImage(catalog, "Mark", brand.mark),
    ...templateImage(catalog, "Logo", brand.logo),
    new Json(`${catalog}/AccentColor.colorset/Contents.json`, (set) =>
      colorSet(BrandColors.of(set, "light").accent, BrandColors.of(set, "dark").accent),
    ),
    new Json(`${catalog}/Canvas.colorset/Contents.json`, (set) =>
      colorSet(BrandColors.of(set, "light").canvas, BrandColors.of(set, "dark").canvas),
    ),
  ];
}
