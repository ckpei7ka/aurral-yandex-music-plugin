import { describe, expect, it } from "vitest";
import { mapPlaylist } from "../src/map";
import { playlist, richTrack, track } from "./helpers";

describe("mapPlaylist", () => {
  it("maps a rich playlist to Aurral's import shape", () => {
    const mapped = mapPlaylist(
      playlist({
        cover: { uri: "avatars.yandex.net/get-music-content/10/%%" },
      }) as never,
    );

    expect(mapped.name).toBe("Мой плейлист");
    expect(mapped.artworkUrl).toBe(
      "https://avatars.yandex.net/get-music-content/10/400x400",
    );
    expect(mapped.tracks).toEqual([
      {
        artist: "Исполнитель",
        title: "Песня",
        album: "Альбом",
        durationMs: 180_000,
      },
    ]);
    expect(mapped.stats).toMatchObject({ total: 1, imported: 1, truncated: 0 });
  });

  it("joins multiple artists and tolerates missing album or duration", () => {
    const mapped = mapPlaylist(
      playlist({
        tracks: [
          richTrack({
            artists: [{ name: "A" }, { name: " B " }, { name: "" }, {}],
            albums: [],
            durationMs: undefined,
          }),
        ],
      }) as never,
    );

    expect(mapped.tracks[0]).toEqual({
      artist: "A, B",
      title: "Песня",
      album: null,
      durationMs: null,
    });
  });

  it("rounds durations and rejects non-finite values", () => {
    const mapped = mapPlaylist(
      playlist({
        tracks: [
          richTrack({ durationMs: 1234.6 }),
          richTrack({ durationMs: Number.NaN }),
          richTrack({ durationMs: -50 }),
        ],
      }) as never,
    );

    expect(mapped.tracks.map((item) => item.durationMs)).toEqual([1235, null, 0]);
  });

  it("skips unavailable tracks by default and can include them", () => {
    const source = playlist({
      tracks: [richTrack({ available: false }), richTrack({ available: "false" })],
    });

    const skipped = mapPlaylist(source as never);
    expect(skipped.tracks).toEqual([]);
    expect(skipped.stats.skippedUnavailable).toBe(2);

    const included = mapPlaylist(source as never, { includeUnavailable: true });
    expect(included.tracks).toHaveLength(2);
    expect(included.stats.skippedUnavailable).toBe(0);
  });

  it("skips podcasts", () => {
    const mapped = mapPlaylist(
      playlist({
        tracks: [
          richTrack({ major: { name: "PODCASTS" } }),
          richTrack({ major: { name: "podcasts" } }),
          richTrack({ major: { name: "RUSSIA" } }),
        ],
      }) as never,
    );

    expect(mapped.tracks).toHaveLength(1);
    expect(mapped.stats.skippedPodcast).toBe(2);
  });

  it("accepts bare track objects from non-rich responses", () => {
    const mapped = mapPlaylist(
      playlist({ tracks: [track({ title: "Bare" })] }) as never,
    );

    expect(mapped.tracks[0]).toMatchObject({ title: "Bare", artist: "Исполнитель" });
  });

  it("skips entries it cannot understand", () => {
    const mapped = mapPlaylist(
      playlist({
        tracks: [
          "123456",
          42,
          null,
          { id: 1 },
          { track: null },
          richTrack({ title: "   " }),
          richTrack({ artists: [] }),
          richTrack(),
        ],
      }) as never,
    );

    expect(mapped.tracks).toHaveLength(1);
    expect(mapped.stats.skippedInvalid).toBe(7);
    expect(mapped.stats.total).toBe(8);
  });

  it("builds a liked-songs title from the owner", () => {
    expect(
      mapPlaylist(playlist({ kind: "3", owner: { name: "Алиса" } }) as never).name,
    ).toBe("Мне нравится — Алиса");
    expect(
      mapPlaylist(playlist({ kind: 3, owner: { login: "alice" } }) as never).name,
    ).toBe("Мне нравится — alice");
    expect(mapPlaylist(playlist({ kind: 3, owner: null }) as never).name).toBe("Мне нравится");
    expect(mapPlaylist(playlist({ kind: 3, owner: { name: "  " } }) as never).name).toBe(
      "Мне нравится",
    );
  });

  it("falls back to a readable name and clamps long titles", () => {
    expect(mapPlaylist(playlist({ title: "   " }) as never).name).toBe("Плейлист Яндекс Музыки");
    expect(mapPlaylist(playlist({ title: undefined }) as never).name).toBe(
      "Плейлист Яндекс Музыки",
    );
    expect(mapPlaylist(playlist({ title: "x".repeat(250) }) as never).name).toHaveLength(200);
  });

  it("falls back through cover items, ogImage and upgrades http", () => {
    expect(
      mapPlaylist(
        playlist({
          cover: { itemsUri: [null, "//avatars.yandex.net/get-music-content/2/%%"] },
        }) as never,
      ).artworkUrl,
    ).toBe("https://avatars.yandex.net/get-music-content/2/400x400");

    expect(
      mapPlaylist(playlist({ cover: null, ogImage: "http://avatars.yandex.net/og.jpg" }) as never)
        .artworkUrl,
    ).toBe("https://avatars.yandex.net/og.jpg");

    expect(
      mapPlaylist(playlist({ cover: { uri: "https://avatars.yandex.net/cover.jpg" } }) as never)
        .artworkUrl,
    ).toBe("https://avatars.yandex.net/cover.jpg");
  });

  it("returns null artwork when every candidate is invalid", () => {
    expect(
      mapPlaylist(playlist({ cover: { uri: "bad url with spaces" }, ogImage: null }) as never)
        .artworkUrl,
    ).toBeNull();
    expect(mapPlaylist(playlist({ cover: null }) as never).artworkUrl).toBeNull();
  });

  it("caps tracks at Aurral's 5000 limit", () => {
    const source = playlist({
      tracks: Array.from({ length: 5002 }, (_, index) => richTrack({ title: `Song ${index}` })),
    });

    const mapped = mapPlaylist(source as never);
    expect(mapped.tracks).toHaveLength(5000);
    expect(mapped.stats.truncated).toBe(2);

    const smaller = mapPlaylist(source as never, { maxTracks: 10 });
    expect(smaller.tracks).toHaveLength(10);
    expect(smaller.stats.truncated).toBe(4992);
  });

  it("handles a playlist with no tracks field", () => {
    const mapped = mapPlaylist(playlist({ tracks: null }) as never);
    expect(mapped.tracks).toEqual([]);
    expect(mapped.stats.total).toBe(0);
  });
});
