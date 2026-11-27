import { describe, expect, it } from "vitest";
import { normalizeToken } from "../src/token";
import { PluginError } from "../src/errors";

describe("normalizeToken", () => {
  it.each([
    ["y0_AgAAAA_token", "y0_AgAAAA_token"],
    ["  y0_AgAAAA_token  ", "y0_AgAAAA_token"],
    ["OAuth y0_AgAAAA_token", "y0_AgAAAA_token"],
    ["oauth y0_AgAAAA_token", "y0_AgAAAA_token"],
    ["Bearer y0_AgAAAA_token", "y0_AgAAAA_token"],
    ["'y0_AgAAAA_token'", "y0_AgAAAA_token"],
    ['"OAuth y0_AgAAAA_token"', "y0_AgAAAA_token"],
    [
      "https://music.yandex.ru/#access_token=y0_AgAAAA_token&token_type=bearer&expires_in=31535645",
      "y0_AgAAAA_token",
    ],
    ["https://music.yandex.ru/?access_token=y0_AgAAAA_token", "y0_AgAAAA_token"],
    ["access_token=y0_AgAAAA_token", "y0_AgAAAA_token"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeToken(input)).toBe(expected);
  });

  it("keeps token characters such as dashes and underscores", () => {
    expect(normalizeToken("abc-DEF_123.456")).toBe("abc-DEF_123.456");
  });

  it.each([
    "",
    "   ",
    undefined,
    null,
    42,
    "OAuth ",
    "Bearer   ",
    "https://music.yandex.ru/#token_type=bearer",
    "access_token=",
    "two words",
  ])("rejects %s", (input) => {
    expect(() => normalizeToken(input)).toThrow(PluginError);
  });

  it("explains how to find the token when a pasted URL has none", () => {
    expect(() => normalizeToken("https://music.yandex.ru/#token_type=bearer")).toThrow(
      /access_token/,
    );
  });
});
