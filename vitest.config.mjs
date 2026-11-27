import ts from "typescript";
import { defineConfig } from "vitest/config";

/**
 * This project runs inside environments where spawning child processes is not
 * always allowed, and Vite's default esbuild transform starts a child process.
 * TypeScript's transpiler is pure JS, so a tiny pre-plugin replaces esbuild.
 */
function typescriptTransform() {
  return {
    name: "aurral-typescript-transform",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0];
      if (!file.endsWith(".ts")) return null;
      const result = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
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
}

export default defineConfig({
  esbuild: false,
  plugins: [typescriptTransform()],
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "threads",
    poolOptions: {
      threads: { singleThread: true },
    },
    deps: {
      optimizer: { enabled: false },
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/types.ts", "src/aurral.ts"],
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});
