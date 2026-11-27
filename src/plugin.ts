import type { AurralPlugin, Base, ImportedPlaylist, SettingValue } from "./aurral";
import { YandexMusicClient, type FetchLike } from "./client";
import { PluginError, trimmedString } from "./errors";
import { mapPlaylist } from "./map";
import { normalizeToken } from "./token";
import { parsePlaylistUrl } from "./url";

export interface PluginDeps {
  /** Injection point for tests; defaults to the global fetch in the plugin host. */
  fetch?: FetchLike;
}

export function readIncludeUnavailable(settings: Record<string, SettingValue>): boolean {
  const value = settings.includeUnavailable;
  return value === true || value === 1 || value === "true" || value === "1";
}

function createClient(settings: Record<string, SettingValue>, deps: PluginDeps): YandexMusicClient {
  const raw = settings.token;
  const token = normalizeToken(typeof raw === "string" ? raw : "");
  return new YandexMusicClient(token, deps.fetch);
}

export function createPlugin(deps: PluginDeps = {}): AurralPlugin {
  return {
    async test({ settings }: Base): Promise<{ message: string }> {
      const status = await createClient(settings, deps).accountStatus();
      const account = status.account ?? undefined;
      const label = trimmedString(account?.displayName) || trimmedString(account?.login);
      if (label) return { message: `Токен работает. Аккаунт: ${label}.` };
      if (account?.uid !== undefined && account?.uid !== null) {
        return { message: `Токен работает. UID: ${String(account.uid)}.` };
      }
      return { message: "Токен принят Яндекс Музыкой." };
    },

    importList: {
      async fetch({ settings, url }: Base & { url: string }): Promise<ImportedPlaylist> {
        const link = parsePlaylistUrl(url);
        const playlist = await createClient(settings, deps).getPlaylist(link);
        const mapped = mapPlaylist(playlist, {
          includeUnavailable: readIncludeUnavailable(settings),
        });

        if (mapped.stats.total > 0 && mapped.tracks.length === 0) {
          throw new PluginError(
            "В этом плейлисте нет треков, доступных для импорта: все они недоступны в вашем регионе или являются подкастами.",
          );
        }

        return {
          name: mapped.name,
          artworkUrl: mapped.artworkUrl,
          tracks: mapped.tracks,
        };
      },
    },
  };
}
