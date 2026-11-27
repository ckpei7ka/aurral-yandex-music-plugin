import { expect } from "vitest";
import type { ImportedPlaylist } from "../src/aurral";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function track(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1001,
    title: "Песня",
    durationMs: 180_000,
    available: true,
    artists: [{ id: 1, name: "Исполнитель" }],
    albums: [{ id: 2, title: "Альбом" }],
    coverUri: "avatars.yandex.net/get-music-content/1/%%",
    major: { name: "RUSSIA" },
    ...overrides,
  };
}

export function richTrack(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 500, realId: 1001, track: track(overrides) };
}

export function playlist(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 123,
    title: "Мой плейлист",
    owner: { uid: 42, login: "alice", name: "Алиса" },
    cover: { uri: "avatars.yandex.net/get-music-content/10/%%" },
    tracks: [richTrack()],
    ...overrides,
  };
}

/** The subset of checks Aurral's playlistResult schema performs on import answers. */
export function assertImportAnswer(answer: ImportedPlaylist): void {
  expect(typeof answer.name).toBe("string");
  expect(answer.name.trim().length).toBeGreaterThan(0);
  expect(answer.name.length).toBeLessThanOrEqual(200);
  if (answer.artworkUrl !== undefined && answer.artworkUrl !== null) {
    expect(answer.artworkUrl).toMatch(/^https?:\/\//i);
  }
  expect(Array.isArray(answer.tracks)).toBe(true);
  expect(answer.tracks.length).toBeLessThanOrEqual(5000);
  for (const item of answer.tracks) {
    expect(typeof item.artist).toBe("string");
    expect(item.artist.trim().length).toBeGreaterThan(0);
    expect(item.artist.length).toBeLessThanOrEqual(500);
    expect(typeof item.title).toBe("string");
    expect(item.title.trim().length).toBeGreaterThan(0);
    expect(item.title.length).toBeLessThanOrEqual(500);
    if (item.album !== undefined && item.album !== null) {
      expect(typeof item.album).toBe("string");
      expect(item.album.length).toBeLessThanOrEqual(500);
    }
    if (item.durationMs !== undefined && item.durationMs !== null) {
      expect(typeof item.durationMs).toBe("number");
      expect(item.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(item.durationMs)).toBe(true);
    }
  }
}
