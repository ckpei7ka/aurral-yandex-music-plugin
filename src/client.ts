import { asRecord, describeError, PluginError, trimmedString } from "./errors";
import type { ParsedPlaylistUrl } from "./url";
import type { YandexPlaylist, YandexResult, YandexStatusResult } from "./types";

export const API_BASE = "https://api.music.yandex.net";
export const REQUEST_TIMEOUT_MS = 30_000;
export const PLAYLIST_PAGE_SIZE = 5000;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface RequestQuery {
  [key: string]: string | number | boolean | undefined;
}

function apiDetail(json: unknown, body: string): string {
  const record = asRecord(json);
  if (record) {
    for (const key of ["errorDescription", "message", "error"]) {
      const value = trimmedString(record[key]);
      if (value) return value;
    }
  }
  return body.trim().slice(0, 200);
}

function statusMessage(status: number): string {
  switch (status) {
    case 400:
      return "Яндекс Музыка отклонила запрос (400). Проверьте ссылку на плейлист.";
    case 401:
      return "Яндекс Музыка отклонила OAuth-токен (401). Проверьте токен в настройках плагина.";
    case 403:
      return "У Яндекс Музыки нет доступа к этому плейлисту (403). Возможно, он приватный или токен не подходит.";
    case 404:
      return "Плейлист не найден (404). Возможно, он удалён или ссылка неверна.";
    case 429:
      return "Яндекс Музыка ограничила частоту запросов (429). Попробуйте позже.";
    default:
      return status >= 500
        ? `Яндекс Музыка временно недоступна (${status}). Попробуйте позже.`
        : `Запрос к Яндекс Музыке завершился ошибкой ${status}.`;
  }
}

export class YandexMusicClient {
  private readonly token: string;
  private readonly fetchImpl: FetchLike;

  constructor(token: string, fetchImpl: FetchLike = fetch) {
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async accountStatus(): Promise<YandexStatusResult> {
    const json = await this.getJson("/account/status");
    const result = asRecord(asRecord(json)?.result);
    if (!result) {
      throw new PluginError("Яндекс Музыка вернула неожиданный ответ на запрос статуса аккаунта.");
    }
    return result as YandexStatusResult;
  }

  async getPlaylist(link: ParsedPlaylistUrl): Promise<YandexPlaylist> {
    const path =
      link.kind === "uuid"
        ? `/playlist/${encodeURIComponent(link.uuid ?? "")}`
        : `/users/${encodeURIComponent(link.user ?? "")}/playlists/${encodeURIComponent(link.playlistKind ?? "")}`;
    const json = await this.getJson(path, {
      "rich-tracks": "true",
      "page-size": PLAYLIST_PAGE_SIZE,
    });
    const result = asRecord(asRecord(json)?.result);
    if (!result) {
      throw new PluginError("Яндекс Музыка вернула неожиданный ответ с данными плейлиста.");
    }
    return result as YandexPlaylist;
  }

  private async getJson(path: string, query: RequestQuery = {}): Promise<unknown> {
    const url = new URL(path, API_BASE);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `OAuth ${this.token}`,
          "User-Agent": "Yandex-Music-API",
          "X-Yandex-Music-Client": "YandexMusicAndroid/24023621",
          "Accept-Language": "ru",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new PluginError("Яндекс Музыка не ответила за 30 секунд. Попробуйте ещё раз.", {
          cause: error,
        });
      }
      throw new PluginError(
        `Не удалось подключиться к Яндекс Музыке: ${describeError(error)}`,
        { cause: error },
      );
    }

    const body = await response.text().catch(() => "");
    let json: unknown = null;
    let parseFailed = false;
    if (body.trim()) {
      try {
        json = JSON.parse(body);
      } catch {
        parseFailed = true;
      }
    }

    if (!response.ok) {
      if (parseFailed) {
        const detail = body.trim().slice(0, 200);
        throw new PluginError(`${statusMessage(response.status)}${detail ? `: ${detail}` : ""}`);
      }
      const detail = apiDetail(json, body);
      const suffix = detail ? `: ${detail}` : "";
      throw new PluginError(`${statusMessage(response.status)}${suffix}`);
    }

    if (parseFailed) {
      throw new PluginError(
        `Яндекс Музыка вернула ответ, который не удалось прочитать (HTTP ${response.status}).`,
      );
    }
    if (json === null) {
      throw new PluginError("Яндекс Музыка вернула пустой ответ.");
    }
    return json;
  }
}

export type { YandexResult };
