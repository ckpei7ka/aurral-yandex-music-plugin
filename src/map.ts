import type { ImportedPlaylist } from "./aurral";
import { asRecord, trimmedString } from "./errors";
import type { YandexPlaylist, YandexTrack } from "./types";

export type ImportedTrack = ImportedPlaylist["tracks"][number];

export interface MapStats {
  total: number;
  imported: number;
  skippedUnavailable: number;
  skippedPodcast: number;
  skippedInvalid: number;
  truncated: number;
}

export interface MappedPlaylist {
  name: string;
  artworkUrl: string | null;
  tracks: ImportedTrack[];
  stats: MapStats;
}

export interface MapOptions {
  /** Import tracks that Yandex marks as unavailable. Default false. */
  includeUnavailable?: boolean;
  /** Hard cap; Aurral itself accepts at most 5000 tracks per playlist. */
  maxTracks?: number;
}

export const MAX_TRACKS = 5000;

function resolveTrack(entry: unknown): YandexTrack | null {
  const outer = asRecord(entry);
  if (!outer) return null;
  const nested = asRecord(outer.track);
  if (nested) return nested as YandexTrack;
  // Defensive: non-rich responses (and some old payloads) contain bare tracks.
  if (
    typeof outer.title === "string" ||
    Array.isArray(outer.artists) ||
    Array.isArray(outer.albums) ||
    typeof outer.durationMs === "number"
  ) {
    return outer as YandexTrack;
  }
  return null;
}

function isUnavailable(track: YandexTrack): boolean {
  return track.available === false || track.available === "false";
}

function isPodcast(track: YandexTrack): boolean {
  return trimmedString(track.major?.name).toUpperCase() === "PODCASTS";
}

function mapTrack(track: YandexTrack): ImportedTrack | null {
  const title = trimmedString(track.title);
  if (!title) return null;

  const artists = Array.isArray(track.artists) ? track.artists : [];
  const artist = artists
    .map((item) => trimmedString(item?.name))
    .filter(Boolean)
    .join(", ");
  if (!artist) return null;

  const albums = Array.isArray(track.albums) ? track.albums : [];
  const album = trimmedString(albums[0]?.title) || null;

  const durationMs =
    typeof track.durationMs === "number" && Number.isFinite(track.durationMs)
      ? Math.max(0, Math.round(track.durationMs))
      : null;

  return { artist, title, album, durationMs };
}

function coverUrl(value: unknown): string | null {
  const uri = trimmedString(value);
  if (!uri) return null;
  let candidate = uri;
  if (candidate.startsWith("//")) {
    candidate = `https:${candidate}`;
  } else if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  candidate = candidate.replace(/%%/g, "400x400");
  try {
    const url = new URL(candidate);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function playlistArtwork(playlist: YandexPlaylist): string | null {
  const cover = asRecord(playlist.cover);
  const fromUri = coverUrl(cover?.uri);
  if (fromUri) return fromUri;

  const items = Array.isArray(cover?.itemsUri) ? cover.itemsUri : [];
  for (const item of items) {
    const url = coverUrl(item);
    if (url) return url;
  }
  return coverUrl(playlist.ogImage);
}

function clampName(value: string): string {
  return value.length > 200 ? value.slice(0, 200) : value;
}

function playlistName(playlist: YandexPlaylist): string {
  const owner = asRecord(playlist.owner);
  const ownerName = trimmedString(owner?.name) || trimmedString(owner?.login);

  if (String(playlist.kind ?? "") === "3") {
    return clampName(ownerName ? `Мне нравится — ${ownerName}` : "Мне нравится");
  }
  return clampName(trimmedString(playlist.title) || "Плейлист Яндекс Музыки");
}

/**
 * Converts a Yandex Music playlist into Aurral's import answer. Tracks with an
 * empty artist or title are dropped here as well, because Aurral's normalizer
 * would silently discard them later anyway.
 */
export function mapPlaylist(playlist: YandexPlaylist, options: MapOptions = {}): MappedPlaylist {
  const includeUnavailable = options.includeUnavailable === true;
  const maxTracks = Math.max(0, options.maxTracks ?? MAX_TRACKS);
  const rawTracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];

  const tracks: ImportedTrack[] = [];
  const stats: MapStats = {
    total: rawTracks.length,
    imported: 0,
    skippedUnavailable: 0,
    skippedPodcast: 0,
    skippedInvalid: 0,
    truncated: 0,
  };

  for (const entry of rawTracks) {
    const track = resolveTrack(entry);
    if (!track) {
      stats.skippedInvalid += 1;
      continue;
    }
    if (isPodcast(track)) {
      stats.skippedPodcast += 1;
      continue;
    }
    if (!includeUnavailable && isUnavailable(track)) {
      stats.skippedUnavailable += 1;
      continue;
    }
    const mapped = mapTrack(track);
    if (!mapped) {
      stats.skippedInvalid += 1;
      continue;
    }
    if (tracks.length >= maxTracks) {
      stats.truncated += 1;
      continue;
    }
    tracks.push(mapped);
  }

  stats.imported = tracks.length;

  return {
    name: playlistName(playlist),
    artworkUrl: playlistArtwork(playlist),
    tracks,
    stats,
  };
}
