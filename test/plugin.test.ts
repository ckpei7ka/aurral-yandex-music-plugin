import { describe, expect, it } from "vitest";
import type { Base } from "../src/aurral";
import { PluginError } from "../src/errors";
import { createPlugin, readIncludeUnavailable } from "../src/plugin";
import type { FetchLike } from "../src/client";
import { assertImportAnswer, jsonResponse, playlist, richTrack } from "./helpers";

const base: Base = {
  settings: { token: "secret-token" },
  libraryFolder: "F:/library",
  dataFolder: "F:/data",
};

interface Recorded {
  url: string;
  headers: Headers;
}

function fixtureFetch(
  handler: (url: URL) => Response | Promise<Response>,
): { fetchImpl: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), headers: new Headers(init?.headers) });
    return handler(url);
  };
  return { fetchImpl, calls };
}

function yandexFetch(playlistBody: unknown = playlist()): ReturnType<typeof fixtureFetch> {
  return fixtureFetch((url) => {
    if (url.pathname === "/account/status") {
      return jsonResponse({
        result: { account: { uid: 42, login: "alice", displayName: "Алиса" } },
      });
    }
    return jsonResponse({ result: playlistBody });
  });
}

describe("createPlugin", () => {
  it("reports the account behind the token", async () => {
    const { fetchImpl } = yandexFetch();
    const plugin = createPlugin({ fetch: fetchImpl });

    await expect(plugin.test!(base)).resolves.toEqual({
      message: "Токен работает. Аккаунт: Алиса.",
    });
  });

  it("falls back to the login, uid and a generic message", async () => {
    const missing = fixtureFetch(() => jsonResponse({ result: {} }));
    await expect(createPlugin({ fetch: missing.fetchImpl }).test!(base)).resolves.toEqual({
      message: "Токен принят Яндекс Музыкой.",
    });

    const login = fixtureFetch(() =>
      jsonResponse({ result: { account: { login: "alice" } } }),
    );
    await expect(createPlugin({ fetch: login.fetchImpl }).test!(base)).resolves.toEqual({
      message: "Токен работает. Аккаунт: alice.",
    });

    const uid = fixtureFetch(() => jsonResponse({ result: { account: { uid: 7 } } }));
    await expect(createPlugin({ fetch: uid.fetchImpl }).test!(base)).resolves.toEqual({
      message: "Токен работает. UID: 7.",
    });

    const empty = fixtureFetch(() => jsonResponse({ result: { account: {} } }));
    await expect(createPlugin({ fetch: empty.fetchImpl }).test!(base)).resolves.toEqual({
      message: "Токен принят Яндекс Музыкой.",
    });
  });

  it("accepts a pasted OAuth redirect URL as the token", async () => {
    const { fetchImpl, calls } = yandexFetch();
    const plugin = createPlugin({ fetch: fetchImpl });

    await plugin.test!({
      ...base,
      settings: {
        token: "https://music.yandex.ru/#access_token=pasted-token&token_type=bearer",
      },
    });

    expect(calls[0]?.headers.get("authorization")).toBe("OAuth pasted-token");
  });

  it("fails before any request when the token is missing", async () => {
    const { fetchImpl, calls } = yandexFetch();
    const plugin = createPlugin({ fetch: fetchImpl });

    await expect(plugin.test!({ ...base, settings: {} })).rejects.toThrow(/токен/i);
    await expect(
      plugin.importList!.fetch({ ...base, settings: {}, url: "https://music.yandex.ru/users/alice/playlists/1" }),
    ).rejects.toThrow(PluginError);
    expect(calls).toHaveLength(0);
  });

  it("imports a user playlist", async () => {
    const { fetchImpl, calls } = yandexFetch();
    const plugin = createPlugin({ fetch: fetchImpl });

    const answer = await plugin.importList!.fetch({
      ...base,
      url: "https://music.yandex.ru/users/alice/playlists/123?utm_source=share",
    });

    assertImportAnswer(answer);
    expect(answer.name).toBe("Мой плейлист");
    expect(answer.tracks).toEqual([
      { artist: "Исполнитель", title: "Песня", album: "Альбом", durationMs: 180_000 },
    ]);
    expect(calls[0]?.url).toContain("/users/alice/playlists/123");
  });

  it("imports a UUID playlist", async () => {
    const { fetchImpl, calls } = yandexFetch();
    const plugin = createPlugin({ fetch: fetchImpl });

    await plugin.importList!.fetch({
      ...base,
      url: "https://music.yandex.ru/playlists/lk.abcdef-123",
    });

    expect(calls[0]?.url).toContain("/playlist/lk.abcdef-123");
  });

  it("imports liked songs with a readable name", async () => {
    const { fetchImpl } = yandexFetch(
      playlist({ kind: 3, owner: { name: "Алиса", login: "alice" } }),
    );
    const plugin = createPlugin({ fetch: fetchImpl });

    const answer = await plugin.importList!.fetch({
      ...base,
      url: "https://music.yandex.ru/users/alice/playlists/3",
    });

    expect(answer.name).toBe("Мне нравится — Алиса");
  });

  it("keeps an empty playlist importable", async () => {
    const { fetchImpl } = yandexFetch(playlist({ tracks: [] }));
    const plugin = createPlugin({ fetch: fetchImpl });

    const answer = await plugin.importList!.fetch({
      ...base,
      url: "https://music.yandex.ru/users/alice/playlists/1",
    });

    expect(answer.tracks).toEqual([]);
  });

  it("rejects an import that lost every track", async () => {
    const { fetchImpl } = yandexFetch(
      playlist({ tracks: [richTrack({ available: false })] }),
    );
    const plugin = createPlugin({ fetch: fetchImpl });

    await expect(
      plugin.importList!.fetch({
        ...base,
        url: "https://music.yandex.ru/users/alice/playlists/1",
      }),
    ).rejects.toThrow(/нет треков, доступных для импорта/);
  });

  it("includes unavailable tracks when the setting is on", async () => {
    const { fetchImpl } = yandexFetch(
      playlist({ tracks: [richTrack({ available: false, title: "Hidden" })] }),
    );
    const plugin = createPlugin({ fetch: fetchImpl });

    const answer = await plugin.importList!.fetch({
      ...base,
      settings: { token: "token", includeUnavailable: "true" },
      url: "https://music.yandex.ru/users/alice/playlists/1",
    });

    expect(answer.tracks[0]).toMatchObject({ title: "Hidden" });
  });

  it("surfaces API errors", async () => {
    const { fetchImpl } = fixtureFetch(() =>
      jsonResponse({ errorDescription: "Invalid token" }, 401),
    );
    const plugin = createPlugin({ fetch: fetchImpl });

    await expect(plugin.test!(base)).rejects.toThrow(/Invalid token/);
  });

  it("rejects foreign links before any request", async () => {
    const { fetchImpl, calls } = yandexFetch();
    const plugin = createPlugin({ fetch: fetchImpl });

    await expect(
      plugin.importList!.fetch({ ...base, url: "https://open.spotify.com/playlist/1" }),
    ).rejects.toThrow(/Поддерживаются.*music\.yandex/s);
    expect(calls).toHaveLength(0);
  });
});

describe("readIncludeUnavailable", () => {
  it.each([
    [true, true],
    [1, true],
    ["true", true],
    ["1", true],
    [false, false],
    [0, false],
    ["false", false],
    ["", false],
    [undefined, false],
  ])("maps %j to %j", (value, expected) => {
    expect(readIncludeUnavailable(value === undefined ? {} : { includeUnavailable: value })).toBe(
      expected,
    );
  });
});
