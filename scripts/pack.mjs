#!/usr/bin/env node
/**
 * Packs dist/<id>/ into the zip Aurral downloads from a GitHub release.
 * The archive keeps a single top-level folder so the plugin folder name and
 * manifest id stay identical after unpacking.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const distDir = path.join(root, "dist", manifest.id);
const artifactsDir = path.join(root, "artifacts");
const zipPath = path.join(artifactsDir, "aurral-yandex-music-plugin.zip");

async function readDistFile(name) {
  try {
    return await readFile(path.join(distDir, name));
  } catch {
    throw new Error(`dist/${manifest.id}/${name} is missing — run "npm run build" first`);
  }
}

const manifestBytes = await readDistFile("manifest.json");
const bundleBytes = await readDistFile("index.js");

const archive = zipSync(
  {
    [`${manifest.id}/manifest.json`]: manifestBytes,
    [`${manifest.id}/index.js`]: bundleBytes,
  },
  { level: 9 },
);

await mkdir(artifactsDir, { recursive: true });
await writeFile(zipPath, archive);

const digest = createHash("sha256").update(archive).digest("hex");
const info = await stat(zipPath);
console.log(`packed artifacts/${path.basename(zipPath)} (${info.size} bytes)`);
console.log(`sha256 ${digest}`);
