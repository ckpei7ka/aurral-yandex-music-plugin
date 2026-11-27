#!/usr/bin/env node
/**
 * Fails the release job when the git tag and the plugin version disagree, so a
 * tag can never publish an archive whose manifest says something else.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? "";
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const expected = `v${manifest.version}`;

if (manifest.version !== pkg.version) {
  console.error(`package.json version ${pkg.version} does not match manifest ${manifest.version}`);
  process.exit(1);
}
if (tag !== expected) {
  console.error(`tag "${tag}" does not match the plugin version (expected "${expected}")`);
  process.exit(1);
}
console.log(`release tag ${tag} matches plugin version ${manifest.version}`);
