import { describe, expect, it } from "vitest";
import { API_BASE, PLAYLIST_PAGE_SIZE, YandexMusicClient, type FetchLike } from "../src/client";
import { PluginError } from "../src/errors";
import { parsePlaylistUrl } from "../src/url";
import { jsonResponse, playlist } from "./helpers";

interface Call {
  url: string;
  init?: RequestInit;
}

function recordingFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { fetchImpl, calls };
}

describe("YandexMusicClient", () => {
  it("requests the account status with OAuth and client headers", async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      jsonResponse({ result: { account: { uid: 42, login: "alice", displayName: "Алиса" } } }),
    );
    const client = new YandexMusicClient("secret-token", fetchImpl);

    await expect(client.accountStatus()).resolves.toMatchObject({
      account: { uid: 42, login: "alice", displayName: "Алиса" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${API_BASE}/account/status`);
    const headers = new Headers(calls[0]!.init?.headers);
    expect(headers.get("authorization")).toBe("OAuth secret-token");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("user-agent")).toBe("Yandex-Music-API");
    expect(headers.get("x-yandex-music-client")).toContain("YandexMusicAndroid");
    expect(calls[0]!.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("loads a user playlist with rich tracks and a 5000 page size", async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ result: playlist() }));
    const client = new YandexMusicClient("token", fetchImpl);
    const link = parsePlaylistUrl("https://music.yandex.ru/users/alice/playlists/123");

    await expect(client.getPlaylist(link)).resolves.toMatchObject({ title: "Мой плейлист" });

    const url = new URL(calls[0]!.url);
    expect(url.origin + url.pathname).toBe(`${API_BASE}/users/alice/playlists/123`);
    expect(url.searchParams.get("rich-tracks")).toBe("true");
    expect(url.searchParams.get("page-size")).toBe(String(PLAYLIST_PAGE_SIZE));
  });

  it("loads a UUID playlist through /playlist/<uuid>", async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ result: playlist() }));
    const client = new YandexMusicClient("token", fetchImpl);

    await client.getPlaylist(parsePlaylistUrl("https://music.yandex.ru/playlists/lk.abc-def"));

    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/playlist/lk.abc-def");
  });

  it("encodes user and kind path segments", async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ result: playlist() }));
    const client = new YandexMusicClient("token", fetchImpl);

    await client.getPlaylist(
      parsePlaylistUrl("https://music.yandex.ru/users/user%40example.com/playlists/3"),
    );

    expect(new URL(calls[0]!.url).pathname).toBe("/users/user%40example.com/playlists/3");
  });

  it.each([
    [400, /400/],
    [401, /401/],
    [403, /403/],
    [404, /404/],
    [429, /429/],
    [500, /500/],
    [502, /502/],
    [418, /418/],
  ])("maps HTTP %i to a readable error", async (status, pattern) => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ errorDescription: "backend says no" }, status));
    const client = new YandexMusicClient("token", fetchImpl);

    const error = await client.accountStatus().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PluginError);
    expect((error as Error).message).toMatch(pattern);
    expect((error as Error).message).toContain("backend says no");
  });

  it("includes a text body when an error response is not JSON", async () => {
    const { fetchImpl } = recordingFetch(() => new Response("<html>bad gateway</html>", { status: 502 }));
    const client = new YandexMusicClient("token", fetchImpl);

    await expect(client.accountStatus()).rejects.toThrow(/bad gateway/);
  });

  it("maps a network failure", async () => {
    const { fetchImpl } = recordingFetch(() => {
      throw new Error("ECONNRESET");
    });
    const client = new YandexMusicClient("token", fetchImpl);

    await expect(client.accountStatus()).rejects.toThrow(/Не удалось подключиться.*ECONNRESET/s);
  });

  it("maps a timeout", async () => {
    const { fetchImpl } = recordingFetch(() => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    });
    const client = new YandexMusicClient("token", fetchImpl);

    await expect(client.accountStatus()).rejects.toThrow(/30 секунд/);
  });

  it("rejects an unreadable successful response", async () => {
    const { fetchImpl } = recordingFetch(() => new Response("not json", { status: 200 }));
    const client = new YandexMusicClient("token", fetchImpl);

    await expect(client.accountStatus()).rejects.toThrow(/не удалось прочитать/);
  });

  it("rejects an empty successful response", async () => {
    const { fetchImpl } = recordingFetch(() => new Response("", { status: 200 }));
    const client = new YandexMusicClient("token", fetchImpl);

    await expect(client.accountStatus()).rejects.toThrow(/пустой ответ/);
  });

  it("rejects a response without a result object", async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ result: null }));
    const client = new YandexMusicClient("token", fetchImpl);

    await expect(client.accountStatus()).rejects.toThrow(/статуса аккаунта/);
    await expect(
      client.getPlaylist(parsePlaylistUrl("https://music.yandex.ru/playlists/lk.abc")),
    ).rejects.toThrow(/данными плейлиста/);
  });

  it("rejects a non-object result", async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ result: "nope" }));
    const client = new YandexMusicClient("token", fetchImpl);

    await expect(client.accountStatus()).rejects.toThrow(PluginError);
  });
});
