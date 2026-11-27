#!/usr/bin/env node
/**
 * Verifies the release archive exactly as Aurral would install it: one plugin
 * folder, a valid manifest whose id matches the folder, and the bundled plugin
 * entry point. Fails the workflow instead of shipping a broken release.
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { validateManifest } from "./manifest-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const zipPath = path.join(root, "artifacts", "aurral-yandex-music-plugin.zip");
const distDir = path.join(root, "dist");

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 500;

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const archive = await readFile(zipPath).catch(() => {
  throw new Error('artifacts/aurral-yandex-music-plugin.zip is missing — run "npm run pack"');
});
const archiveInfo = await stat(zipPath);
check(
  archiveInfo.size <= MAX_ARCHIVE_BYTES,
  `archive is ${archiveInfo.size} bytes, limit is ${MAX_ARCHIVE_BYTES}`,
);

const files = unzipSync(archive);
const names = Object.keys(files).sort();

check(names.length <= MAX_FILES, `archive contains ${names.length} files, limit is ${MAX_FILES}`);

const unpackedBytes = names.reduce((sum, name) => sum + files[name].byteLength, 0);
check(
  unpackedBytes <= MAX_UNPACKED_BYTES,
  `unpacked size is ${unpackedBytes} bytes, limit is ${MAX_UNPACKED_BYTES}`,
);

for (const name of names) {
  check(
    !name.startsWith("/") && !name.split("/").includes("..") && !name.includes("\\"),
    `unsafe path in archive: ${name}`,
  );
}

const topLevelFolders = new Set(
  names.map((name) => name.split("/")[0]).filter((segment) => segment !== ""),
);
check(topLevelFolders.size === 1, `expected a single top-level folder, found ${topLevelFolders.size}`);

const folder = [...topLevelFolders][0] ?? "";
check(/^[a-z0-9][a-z0-9-]{0,62}$/.test(folder), `invalid top-level folder name: "${folder}"`);

const manifestBytes = files[`${folder}/manifest.json`];
const bundleBytes = files[`${folder}/index.js`];
check(manifestBytes !== undefined, `${folder}/manifest.json is missing from the archive`);
check(bundleBytes !== undefined, `${folder}/index.js is missing from the archive`);

if (manifestBytes) {
  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch (error) {
    failures.push(`manifest.json is not valid JSON: ${error.message}`);
  }

  if (manifest) {
    const { errors } = validateManifest(manifest, { folder });
    for (const error of errors) failures.push(`manifest: ${error}`);

    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    check(manifest.version === pkg.version, "manifest version does not match package.json");

    const distManifest = await readFile(path.join(distDir, folder, "manifest.json"), "utf8");
    check(
      distManifest === new TextDecoder().decode(manifestBytes),
      "archive manifest differs from the built manifest",
    );
    check(manifest.importList !== undefined, "manifest does not declare an importList");
    check(manifest.test === true, "manifest does not declare test: true");
  }
}

if (bundleBytes) {
  const bundle = new TextDecoder().decode(bundleBytes);
  check(bundle.length > 1_000, "bundled plugin is suspiciously small");
  check(bundle.includes("export { plugin as default }"), "bundle has no default plugin export");
  check(!/^\s*import\s/m.test(bundle), "bundle still contains static imports");
  check(!/\brequire\s*\(/.test(bundle), "bundle still contains require() calls");

  const distBundle = await readFile(path.join(distDir, folder, "index.js"));
  check(
    Buffer.compare(distBundle, Buffer.from(bundleBytes)) === 0,
    "archive bundle differs from the built bundle",
  );
}

if (failures.length > 0) {
  console.error("release package verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `verified artifacts/aurral-yandex-music-plugin.zip: folder ${folder}/, ` +
    `${names.length} file(s), ${archiveInfo.size} bytes packed, ${unpackedBytes} bytes unpacked`,
);
