import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

export const EXPORTS_DIRECTORY = "artwork/exports";

/** A complete SVG exported from a design tool. Only its canvas size is read; its artwork stays intact. */
export class Artwork {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly svg: string;
  /** The accessible name of images composed from this artwork (the brand's name). */
  readonly label: string;

  constructor(name: string, width: number, height: number, svg: string, label = name) {
    this.name = name;
    this.width = width;
    this.height = height;
    this.svg = svg;
    this.label = label;
  }

  get source(): string {
    return `${EXPORTS_DIRECTORY}/${this.name}.svg`;
  }

  static async parse(name: string, svg: string, label = name): Promise<Artwork> {
    const source = `${EXPORTS_DIRECTORY}/${name}.svg`;
    const metadata = await sharp(Buffer.from(svg)).metadata();
    if (metadata.format !== "svg" || !metadata.width || !metadata.height) {
      throw new Error(`${source}: expected an SVG with a positive canvas size`);
    }
    return new Artwork(name, metadata.width, metadata.height, svg, label);
  }
}

/** Reads `artwork/exports/<name>.svg` for every name, labelled with the brand's name. */
export async function readArtwork(
  root: string,
  names: readonly string[],
  label: string,
): Promise<Readonly<Record<string, Artwork>>> {
  const read = (name: string) =>
    Artwork.parse(name, readFileSync(join(root, EXPORTS_DIRECTORY, `${name}.svg`), "utf8"), label);
  const artwork = await Promise.all(names.map(read));
  return Object.fromEntries(artwork.map((art) => [art.name, art]));
}

/** The three exports the app platforms (Apple, Android) compose their assets from. */
export class BrandExports {
  readonly mark: Artwork;
  readonly appIcon: Artwork;
  readonly logo: Artwork;

  constructor(mark: Artwork, appIcon: Artwork, logo: Artwork) {
    this.mark = mark;
    this.appIcon = appIcon;
    this.logo = logo;
    if (appIcon.width !== 1024 || appIcon.height !== 1024) {
      throw new Error(
        `${appIcon.source}: the app icon's artboard is 1024 × 1024 (found ${appIcon.width} × ${appIcon.height})`,
      );
    }
  }

  /** Picks the `mark`, `app-icon` and `logo` artboards. */
  static from(artwork: Readonly<Record<string, Artwork>>): BrandExports {
    const pick = (name: string): Artwork => {
      const art = artwork[name];
      if (art === undefined) {
        throw new Error(`${EXPORTS_DIRECTORY}/${name}.svg: list "${name}" in the config's artwork`);
      }
      return art;
    };
    return new BrandExports(pick("mark"), pick("app-icon"), pick("logo"));
  }

  static async read(root: string, label: string): Promise<BrandExports> {
    return BrandExports.from(await readArtwork(root, ["mark", "app-icon", "logo"], label));
  }
}
