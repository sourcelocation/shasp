#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { readArtwork } from "./brand/exports.ts";
import type { BrandConfig } from "./config.ts";
import { TokenSetLoader } from "./token-set.ts";

const usage = "usage: shasp <build|check> [--config brand.config.ts]";

/** Whether a published file is what the sources produce. PNG encoders differ between platforms, so those are compared by their pixels. */
async function sameOutput(path: string, published: Buffer, produced: Buffer): Promise<boolean> {
  if (published.equals(produced)) return true;
  if (!path.endsWith(".png")) return false;
  const pixels = async (png: Buffer) => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const [a, b] = await Promise.all([pixels(published), pixels(produced)]);
  return a.info.width === b.info.width && a.info.height === b.info.height && a.data.equals(b.data);
}

async function loadConfig(path: string): Promise<BrandConfig> {
  const module = (await import(pathToFileURL(path).href)) as { default?: BrandConfig };
  if (module.default === undefined) {
    throw new Error(`${path}: export the brand with \`export default defineBrand({…})\``);
  }
  return module.default;
}

/** Writes every output under the brand project (build), or reports what is out of date (check). */
async function run(check: boolean, configPath: string): Promise<number> {
  const root = dirname(configPath);
  const config = await loadConfig(configPath);
  const set = new TokenSetLoader(join(root, "tokens")).load();
  const emitters = config.outputs(await readArtwork(root, config.artwork ?? [], config.name));
  const stale: string[] = [];
  for (const path of config.obsolete ?? []) {
    if (check && existsSync(join(root, path))) stale.push(`${path} (obsolete)`);
    if (!check) rmSync(join(root, path), { force: true });
  }
  for (const emitter of emitters) {
    const target = join(root, emitter.outputPath);
    const content = await emitter.emit(set);
    const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    if (check) {
      if (!existsSync(target) || !(await sameOutput(emitter.outputPath, readFileSync(target), bytes))) {
        stale.push(emitter.outputPath);
      }
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    console.log(`wrote ${emitter.outputPath}`);
  }
  if (stale.length > 0) {
    console.error(`Brand output is out of date. Run \`shasp build\` and commit the result:\n  ${stale.join("\n  ")}`);
    return 1;
  }
  if (check) console.log("Brand output is up to date.");
  return 0;
}

async function main(args: readonly string[]): Promise<number> {
  const [command, ...rest] = args;
  const flag = rest.indexOf("--config");
  const config = resolve(flag >= 0 ? (rest[flag + 1] ?? "") : "brand.config.ts");
  if ((command !== "build" && command !== "check") || (flag >= 0 && rest[flag + 1] === undefined)) {
    console.error(usage);
    return 2;
  }
  if (!existsSync(config)) {
    console.error(`${config} not found. Run shasp in the brand project, or pass --config.`);
    return 2;
  }
  return run(command === "check", config);
}

process.exitCode = await main(process.argv.slice(2));
