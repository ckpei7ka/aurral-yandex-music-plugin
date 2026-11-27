import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertImportAnswer, jsonResponse, playlist } from "./helpers";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = path.join(root, "dist", "yandex-music", "index.js");

const source = await readFile(bundlePath, "utf8");
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function loadBundle(): Promise<{
  default: {
    test?: (input: unknown) => Promise<{ message?: string } | void>;
    importList?: { fetch: (input: unknown) => Promise<unknown> };
  };
}> {
  return import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
}

describe("built plugin bundle", () => {
  it("exists as a single bundled ESM file", async () => {
    const info = await stat(bundlePath);
    expect(info.isFile()).toBe(true);
    expect(info.size).toBeGreaterThan(1_000);
    expect(info.size).toBeLessThan(1_000_000);
    expect(source).toContain("aurral-yandex-music-plugin v1.0.0");
    expect(source).toContain("export { plugin as default }");
  });

  it("does not depend on Node modules at runtime", () => {
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\s*\(/);
  });

  it("exports a plugin with test and importList", async () => {
    const module = await loadBundle();
    expect(Object.keys(module)).toEqual(["default"]);
    expect(typeof module.default.test).toBe("function");
    expect(typeof module.default.importList?.fetch).toBe("function");
  });

  it("works end to end against a stubbed Yandex API", async () => {
    const requests: { url: string; headers: Headers }[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      requests.push({ url: url.toString(), headers: new Headers(init?.headers) });
      if (url.pathname === "/account/status") {
        return jsonResponse({
          result: { account: { uid: 42, login: "alice", displayName: "Алиса" } },
        });
      }
      return jsonResponse({ result: playlist({ kind: 3, owner: { name: "Алиса" } }) });
    }) as typeof fetch;

    const module = await loadBundle();
    const base = { settings: { token: "bundle-token" }, libraryFolder: "", dataFolder: "" };

    await expect(module.default.test!(base)).resolves.toEqual({
      message: "Токен работает. Аккаунт: Алиса.",
    });

    const answer = await module.default.importList!.fetch({
      ...base,
      url: "https://music.yandex.ru/users/alice/playlists/3",
    });
    assertImportAnswer(answer as never);
    expect((answer as { name: string }).name).toBe("Мне нравится — Алиса");
    expect(requests[0]?.headers.get("authorization")).toBe("OAuth bundle-token");
    expect(requests[1]?.url).toContain("/users/alice/playlists/3");
  });
});
