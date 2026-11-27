import { describe, expect, it } from "vitest";
import { asRecord, describeError, PluginError, trimmedString } from "../src/errors";

describe("errors", () => {
  it("keeps the plugin error name and cause", () => {
    const cause = new Error("root");
    const error = new PluginError("visible", { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PluginError");
    expect(error.message).toBe("visible");
    expect(error.cause).toBe(cause);
  });

  it("describes every error shape", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
    expect(describeError("text")).toBe("text");
    expect(describeError({ message: "object" })).toBe("неизвестная ошибка");
    expect(describeError(null)).toBe("неизвестная ошибка");
  });

  it("accepts plain objects only", () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord([])).toBeNull();
    expect(asRecord(null)).toBeNull();
    expect(asRecord("x")).toBeNull();
  });

  it("trims strings", () => {
    expect(trimmedString("  x  ")).toBe("x");
    expect(trimmedString("   ")).toBe("");
    expect(trimmedString(1)).toBe("");
    expect(trimmedString(undefined)).toBe("");
  });
});
