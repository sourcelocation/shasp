import type { Artwork } from "./brand/exports.ts";
import type { Emitter } from "./emitters/emitter.ts";

/**
 * A project's brand: what it is called, which artboards it exports and what to generate from
 * them. Lives in `brand.config.ts` at the root of the brand project, next to `tokens/` and
 * `artwork/exports/`.
 */
export interface BrandConfig {
  /** The brand's name: the accessible name of generated artwork. */
  readonly name: string;
  /** Artboards exported to `artwork/exports/<name>.svg`. */
  readonly artwork?: readonly string[];
  /** Generated files the project no longer produces: `build` deletes them, `check` reports them. */
  readonly obsolete?: readonly string[];
  /** Every generated file, in the order it is written. */
  readonly outputs: (artwork: Readonly<Record<string, Artwork>>) => readonly Emitter[];
}

/** Identity function that gives `brand.config.ts` its types. */
export function defineBrand(config: BrandConfig): BrandConfig {
  return config;
}
