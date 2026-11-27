import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateManifest } from "../scripts/manifest-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as Record<
  string,
  unknown
>;
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
  version: string;
};

function withField(field: string, value: unknown): Record<string, unknown> {
  return { ...manifest, [field]: value };
}

function errorsOf(value: Record<string, unknown>, folder?: string): string[] {
  return validateManifest(value, { folder: folder ?? String(value.id) }).errors as string[];
}

describe("manifest.json", () => {
  it("passes Aurral's manifest rules without warnings", () => {
    const result = validateManifest(manifest, { folder: String(manifest.id) });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("uses the packaged plugin id and version", () => {
    expect(manifest.id).toBe("yandex-music");
    expect(manifest.name).toBe("Яндекс Музыка");
    expect(manifest.api).toBe(1);
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.repository ?? "https://github.com/owner/aurral-yandex-music-plugin").toMatch(
      /^https:\/\//,
    );
  });

  it("declares the capabilities the plugin implements", () => {
    expect(manifest.test).toBe(true);
    expect(manifest.importList).toMatchObject({
      label: "Яндекс Музыка",
      sync: true,
      hosts: ["music.yandex.ru", "music.yandex.com", "music.yandex.kz", "music.yandex.by"],
    });
    expect(manifest.settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "token", type: "password", required: true }),
        expect.objectContaining({ key: "includeUnavailable", type: "boolean" }),
      ]),
    );
  });

  it("rejects an invalid id", () => {
    expect(errorsOf(withField("id", "Yandex Music"))).toEqual(
      expect.arrayContaining([expect.stringMatching(/id/) ]),
    );
    expect(errorsOf(withField("id", ""))).not.toEqual([]);
  });

  it("requires the folder name to match the id", () => {
    expect(errorsOf(manifest, "other-folder")).toEqual(
      expect.arrayContaining([expect.stringMatching(/папк|folder|id/i)]),
    );
  });

  it("enforces name, version, api, description and repository limits", () => {
    expect(errorsOf(withField("name", "x".repeat(61)))).not.toEqual([]);
    expect(errorsOf(withField("version", ""))).not.toEqual([]);
    expect(errorsOf(withField("api", 2))).not.toEqual([]);
    expect(errorsOf(withField("description", "x".repeat(301)))).not.toEqual([]);
    expect(errorsOf(withField("repository", "ftp://example.com/repo"))).not.toEqual([]);
    expect(errorsOf(withField("repository", "https://github.com/owner/repo"))).toEqual([]);
  });

  it("validates settings", () => {
    const token = (manifest.settings as Record<string, unknown>[]).find(
      (setting) => setting.key === "token",
    )!;
    expect(errorsOf(withField("settings", [{ ...token, type: "textarea" }]))).not.toEqual([]);
    expect(errorsOf(withField("settings", [token, token]))).not.toEqual([]);
    expect(errorsOf(withField("settings", [{ ...token, key: "1bad" }]))).not.toEqual([]);
    expect(errorsOf(withField("settings", [{ ...token, label: "x".repeat(61) }]))).not.toEqual(
      [],
    );
  });

  it("validates importList hosts and label", () => {
    const importList = manifest.importList as Record<string, unknown>;
    expect(errorsOf(withField("importList", { ...importList, hosts: [] }))).not.toEqual([]);
    expect(
      errorsOf(withField("importList", { ...importList, hosts: ["https://music.yandex.ru"] })),
    ).not.toEqual([]);
    expect(errorsOf(withField("importList", { ...importList, label: "x".repeat(41) }))).not.toEqual(
      [],
    );
    expect(errorsOf(withField("importList", { ...importList, sync: "yes" }))).not.toEqual([]);
  });

  it("validates optional capabilities and flags unknown fields", () => {
    expect(errorsOf(withField("schedule", "5m"))).not.toEqual([]);
    expect(errorsOf(withField("actions", [{ id: "Bad Id", label: "x" }]))).not.toEqual([]);
    expect(errorsOf(withField("events", { "playlist.created": true }))).not.toEqual([]);
    expect(errorsOf(withField("downloadSource", { tracks: true, keeps: "yes" }))).not.toEqual([]);
    expect(errorsOf(withField("apiAccess", "yes"))).not.toEqual([]);
    expect(errorsOf(withField("test", "yes"))).not.toEqual([]);

    const result = validateManifest(withField("unknownField", 1), {
      folder: String(manifest.id),
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/unknownField/)]),
    );
  });
});
