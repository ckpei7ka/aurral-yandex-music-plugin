/** Shapes of the Yandex Music API responses this plugin reads. */

export interface YandexAccount {
  uid?: number | string;
  login?: string;
  displayName?: string;
  fullName?: string;
}

export interface YandexStatusResult {
  account?: YandexAccount | null;
}

export interface YandexArtist {
  id?: number | string;
  name?: string;
}

export interface YandexAlbum {
  id?: number | string;
  title?: string;
}

export interface YandexMajor {
  name?: string | null;
}

export interface YandexTrack {
  id?: number | string;
  realId?: number | string;
  title?: string;
  version?: string | null;
  durationMs?: number;
  available?: boolean | string;
  artists?: YandexArtist[];
  albums?: YandexAlbum[];
  coverUri?: string | null;
  major?: YandexMajor | null;
}

/** `rich-tracks=true` wraps each track in an object with playlist-specific fields. */
export interface YandexPlaylistTrack {
  id?: number | string;
  track?: YandexTrack | null;
}

export interface YandexCover {
  uri?: string | null;
  itemsUri?: string[] | null;
}

export interface YandexOwner {
  uid?: number | string;
  login?: string;
  name?: string;
}

export interface YandexPlaylist {
  kind?: number | string;
  uid?: number | string;
  title?: string;
  description?: string;
  trackCount?: number;
  durationMs?: number;
  visibility?: string;
  cover?: YandexCover | null;
  ogImage?: string | null;
  owner?: YandexOwner | null;
  tracks?: Array<YandexPlaylistTrack | YandexTrack | string | number> | null;
}

export interface YandexResult<T> {
  result?: T | null;
}
