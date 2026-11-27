import { PluginError } from "./errors";

const OAUTH_PREFIX = /^(?:OAuth|Bearer)\s+/i;

/**
 * Accepts a raw Yandex OAuth token as well as the whole redirect URL that
 * Yandex puts in the address bar (`...#access_token=...`), with or without
 * the `OAuth ` prefix. Tokens are never logged.
 */
export function normalizeToken(raw: unknown): string {
  let value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new PluginError(
      "Укажите OAuth-токен Яндекс Музыки в настройках плагина (поле «OAuth-токен»).",
    );
  }

  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new PluginError("Не удалось разобрать ссылку с токеном. Вставьте токен или ссылку целиком.");
    }
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    value =
      hash.get("access_token") ??
      url.searchParams.get("access_token") ??
      hash.get("token") ??
      url.searchParams.get("token") ??
      "";
    if (!value) {
      throw new PluginError(
        "В этой ссылке нет access_token. После входа в Яндекс Музыку скопируйте адрес целиком — токен находится после #access_token=.",
      );
    }
  } else if (/^access_token=/i.test(value)) {
    const params = new URLSearchParams(value);
    value = params.get("access_token") ?? "";
  }

  value = value
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim()
    .replace(OAUTH_PREFIX, "")
    .trim();

  if (!value || /^(?:OAuth|Bearer)$/i.test(value)) {
    throw new PluginError("OAuth-токен пустой. Скопируйте токен из адресной строки ещё раз.");
  }
  if (/\s/.test(value)) {
    throw new PluginError(
      "OAuth-токен не должен содержать пробелов. Скопируйте только значение access_token.",
    );
  }
  return value;
}
