import { PluginError } from "./errors";

/** Hosts that Aurral's import-list bridge allows (subdomains such as www. count). */
export const SUPPORTED_HOSTS = [
  "music.yandex.ru",
  "music.yandex.com",
  "music.yandex.kz",
  "music.yandex.by",
] as const;

export interface ParsedPlaylistUrl {
  /** Old-style `/users/<login>/playlists/<kind>` link or new `/playlists/<uuid>` link. */
  kind: "user" | "uuid";
  user?: string;
  playlistKind?: string;
  uuid?: string;
  /** Host without a leading `www.`, used to build a canonical link. */
  host: string;
  canonicalUrl: string;
  /** Yandex uses playlist kind 3 for "Мне нравится" (liked songs). */
  likedSongs: boolean;
}

const USER_SEGMENT = /^[0-9A-Za-z@._+-]+$/;
const PLAYLIST_SEGMENT = /^[0-9A-Za-z][0-9A-Za-z._-]*$/;

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new PluginError("Ссылка содержит некорректные символы. Скопируйте её из браузера ещё раз.");
  }
}

function playlistPathError(): PluginError {
  return new PluginError(
    "Это не ссылка на плейлист Яндекс Музыки. Поддерживаются ссылки вида https://music.yandex.ru/users/<логин>/playlists/<номер>, https://music.yandex.ru/iframe/playlist/<логин>/<номер> и https://music.yandex.ru/playlists/<id>.",
  );
}

/**
 * Parses the playlist link formats Yandex Music produces:
 * - `https://music.yandex.ru/users/<login>/playlists/<kind>`
 * - `https://music.yandex.ru/iframe/playlist/<login>/<kind>`
 * - `https://music.yandex.ru/playlists/<uuid>` (also the singular `/playlist/`)
 * with optional query strings, trailing slashes and the .com/.kz/.by domains.
 */
export function parsePlaylistUrl(input: string): ParsedPlaylistUrl {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) throw new PluginError("Вставьте ссылку на плейлист Яндекс Музыки.");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PluginError("Не удалось разобрать ссылку. Вставьте ссылку на плейлист Яндекс Музыки.");
  }

  if (url.protocol !== "https:") {
    throw new PluginError("Нужна ссылка https://. Скопируйте адрес плейлиста из браузера.");
  }
  if (url.port) {
    throw new PluginError("Ссылка содержит порт. Скопируйте обычный адрес плейлиста из браузера.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const host = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  if (!(SUPPORTED_HOSTS as readonly string[]).includes(host)) {
    throw new PluginError(
      `Плагин не поддерживает ссылки с адреса ${hostname || "без домена"}. Поддерживаются music.yandex.ru, music.yandex.com, music.yandex.kz и music.yandex.by.`,
    );
  }

  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .map(decodeSegment);

  let kind: ParsedPlaylistUrl["kind"];
  let user: string | undefined;
  let playlistKind: string | undefined;
  let uuid: string | undefined;

  if (segments.length === 2 && (segments[0] === "playlists" || segments[0] === "playlist")) {
    uuid = segments[1] ?? "";
    if (!PLAYLIST_SEGMENT.test(uuid)) throw playlistPathError();
    kind = "uuid";
  } else if (
    segments.length === 4 &&
    segments[0] === "users" &&
    segments[2] === "playlists"
  ) {
    user = segments[1] ?? "";
    playlistKind = segments[3] ?? "";
    if (!USER_SEGMENT.test(user) || !PLAYLIST_SEGMENT.test(playlistKind)) throw playlistPathError();
    kind = "user";
  } else if (
    segments.length === 4 &&
    segments[0] === "iframe" &&
    segments[1] === "playlist"
  ) {
    user = segments[2] ?? "";
    playlistKind = segments[3] ?? "";
    if (!USER_SEGMENT.test(user) || !PLAYLIST_SEGMENT.test(playlistKind)) throw playlistPathError();
    kind = "user";
  } else {
    throw playlistPathError();
  }

  const base = `https://${host}`;
  const canonicalUrl =
    kind === "uuid"
      ? `${base}/playlists/${encodeURIComponent(uuid ?? "")}`
      : `${base}/users/${encodeURIComponent(user ?? "")}/playlists/${encodeURIComponent(playlistKind ?? "")}`;

  return {
    kind,
    ...(user !== undefined && { user }),
    ...(playlistKind !== undefined && { playlistKind }),
    ...(uuid !== undefined && { uuid }),
    host,
    canonicalUrl,
    likedSongs: kind === "user" && playlistKind === "3",
  };
}
