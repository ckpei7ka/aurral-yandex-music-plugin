import { describe, expect, it } from "vitest";
import { PluginError } from "../src/errors";
import { parsePlaylistUrl, SUPPORTED_HOSTS } from "../src/url";

describe("parsePlaylistUrl", () => {
  it.each([
    [
      "https://music.yandex.ru/users/alice/playlists/123",
      {
        kind: "user",
        user: "alice",
        playlistKind: "123",
        likedSongs: false,
        host: "music.yandex.ru",
        canonicalUrl: "https://music.yandex.ru/users/alice/playlists/123",
      },
    ],
    [
      "https://music.yandex.ru/users/alice/playlists/123?si=abc&utm_source=share",
      { kind: "user", user: "alice", playlistKind: "123" },
    ],
    [
      "https://music.yandex.ru/users/alice/playlists/123/",
      { kind: "user", user: "alice", playlistKind: "123" },
    ],
    [
      "https://music.yandex.com/users/bob/playlists/777",
      {
        kind: "user",
        user: "bob",
        host: "music.yandex.com",
        canonicalUrl: "https://music.yandex.com/users/bob/playlists/777",
      },
    ],
    [
      "https://music.yandex.kz/users/carol/playlists/1",
      { host: "music.yandex.kz", canonicalUrl: "https://music.yandex.kz/users/carol/playlists/1" },
    ],
    [
      "https://music.yandex.by/users/dave/playlists/2",
      { host: "music.yandex.by", canonicalUrl: "https://music.yandex.by/users/dave/playlists/2" },
    ],
    [
      "https://www.music.yandex.ru/users/alice/playlists/123",
      { host: "music.yandex.ru", canonicalUrl: "https://music.yandex.ru/users/alice/playlists/123" },
    ],
    [
      "https://music.yandex.ru/iframe/playlist/alice/701626",
      {
        kind: "user",
        user: "alice",
        playlistKind: "701626",
        canonicalUrl: "https://music.yandex.ru/users/alice/playlists/701626",
      },
    ],
    [
      "https://music.yandex.ru/playlists/lk.abc-def_123",
      {
        kind: "uuid",
        uuid: "lk.abc-def_123",
        canonicalUrl: "https://music.yandex.ru/playlists/lk.abc-def_123",
      },
    ],
    [
      "https://music.yandex.com/playlist/ps.ABC123",
      { kind: "uuid", uuid: "ps.ABC123", canonicalUrl: "https://music.yandex.com/playlists/ps.ABC123" },
    ],
    [
      "https://music.yandex.ru/users/alice/playlists/3",
      { kind: "user", playlistKind: "3", likedSongs: true },
    ],
    [
      "https://music.yandex.ru/users/user%40example.com/playlists/5",
      {
        user: "user@example.com",
        canonicalUrl: "https://music.yandex.ru/users/user%40example.com/playlists/5",
      },
    ],
  ])("parses %s", (input, expected) => {
    expect(parsePlaylistUrl(input)).toMatchObject(expected);
  });

  it("exposes all hosts allowed by the manifest", () => {
    expect(SUPPORTED_HOSTS).toEqual([
      "music.yandex.ru",
      "music.yandex.com",
      "music.yandex.kz",
      "music.yandex.by",
    ]);
  });

  it.each([
    "",
    "   ",
    "не ссылка",
    "music.yandex.ru/users/alice/playlists/1",
    "http://music.yandex.ru/users/alice/playlists/1",
    "https://example.com/users/alice/playlists/1",
    "https://music.yandex.ru.evil.example/users/alice/playlists/1",
    "https://music.yandex.ru:8080/users/alice/playlists/1",
    "https://music.yandex.ru/users/alice",
    "https://music.yandex.ru/users/alice/playlists/",
    "https://music.yandex.ru/users/alice/playlists/1/extra",
    "https://music.yandex.ru/playlists/",
    "https://music.yandex.ru/playlists/a/b",
    "https://music.yandex.ru/album/123",
    "https://music.yandex.ru/track/123",
    "https://music.yandex.ru/artist/123",
    "https://music.yandex.ru/iframe/album/alice/1",
    "https://music.yandex.ru/users/alice/playlists/bad%2Fkind",
  ])("rejects %s", (input) => {
    expect(() => parsePlaylistUrl(input)).toThrow(PluginError);
  });

  it("mentions supported domains in the error for a foreign host", () => {
    expect(() => parsePlaylistUrl("https://example.com/users/alice/playlists/1")).toThrow(
      /music\.yandex\.ru/,
    );
  });
});
