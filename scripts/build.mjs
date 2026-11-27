#!/usr/bin/env node
/**
 * Builds the installable plugin bundle without native build tools: TypeScript
 * transpiles the sources and Rollup (pure JS) bundles them into one ESM file.
 */
import { statSync } from "node:fs";
import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rollup } from "rollup";
import ts from "typescript";
import { validateManifest } from "./manifest-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src");
const manifestPath = path.join(root, "manifest.json");
const packagePath = path.join(root, "package.json");
const distRoot = path.join(root, "dist");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const pkg = JSON.parse(await readFile(packagePath, "utf8"));

const { errors } = validateManifest(manifest, { folder: manifest.id });
if (errors.length > 0) {
  throw new Error(`manifest.json is invalid:\n- ${errors.join("\n- ")}`);
}
if (pkg.version !== manifest.version) {
  throw new Error(
    `package.json version ${pkg.version} does not match manifest version ${manifest.version}`,
  );
}

const outDir = path.join(distRoot, manifest.id);
const bundlePath = path.join(outDir, "index.js");

await rm(distRoot, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const typescriptPlugin = {
  name: "aurral-typescript",
  resolveId(source, importer) {
    if (!source.startsWith(".") || !importer) return null;
    const base = path.resolve(path.dirname(importer), source);
    for (const candidate of [base, `${base}.ts`, path.join(base, "index.ts")]) {
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // try the next candidate
      }
    }
    return null;
  },
  load(id) {
    return id.endsWith(".ts") ? readFile(id, "utf8") : null;
  },
  transform(code, id) {
    if (!id.endsWith(".ts")) return null;
    const result = ts.transpileModule(code, {
      fileName: id,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        removeComments: false,
        sourceMap: true,
        inlineSources: true,
      },
    });
    return {
      code: result.outputText,
      map: result.sourceMapText ? JSON.parse(result.sourceMapText) : null,
    };
  },
};

const bundle = await rollup({
  input: path.join(srcDir, "index.ts"),
  plugins: [typescriptPlugin],
  onwarn(warning, warn) {
    if (warning.code === "CIRCULAR_DEPENDENCY") return;
    warn(warning);
  },
});

// A readable bundle is intentional: plugin code is auditable by the user who installs it.
await bundle.write({
  file: bundlePath,
  format: "esm",
  sourcemap: false,
  banner: `// aurral-yandex-music-plugin v${manifest.version} — generated file, do not edit\n`,
});
await bundle.close();

await cp(manifestPath, path.join(outDir, "manifest.json"));

const bundleBytes = (await stat(bundlePath)).size;
const manifestBytes = (await stat(path.join(outDir, "manifest.json"))).size;
console.log(
  `built dist/${manifest.id}/index.js (${bundleBytes} bytes) + manifest.json (${manifestBytes} bytes)`,
);
