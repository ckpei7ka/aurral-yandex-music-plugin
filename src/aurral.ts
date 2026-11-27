/**
 * Narrow copy of the parts of Aurral's plugin API that this plugin uses.
 * The authoritative definitions live in the Aurral repository:
 * backend/services/plugins/aurral-plugin.d.ts
 */

export type SettingValue = string | number | boolean;

export interface Base {
  settings: Record<string, SettingValue>;
  libraryFolder: string;
  dataFolder: string;
}

export interface ImportedPlaylist {
  name: string;
  artworkUrl?: string | null;
  tracks: {
    artist: string;
    title: string;
    album?: string | null;
    durationMs?: number | null;
    mbid?: string | null;
  }[];
}

export interface AurralPlugin {
  test?(input: Base): Promise<{ message?: string } | void>;
  importList?: {
    fetch(input: Base & { url: string }): Promise<ImportedPlaylist>;
  };
}
