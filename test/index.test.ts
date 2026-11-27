import { describe, expect, it } from "vitest";
import plugin from "../src/index";

describe("plugin entry point", () => {
  it("exposes an Aurral plugin with the declared capabilities", () => {
    expect(typeof plugin).toBe("object");
    expect(typeof plugin.test).toBe("function");
    expect(typeof plugin.importList?.fetch).toBe("function");
  });

  it("has no capabilities the manifest does not declare", () => {
    const exported = plugin as Record<string, unknown>;
    expect(exported.downloadSource).toBeUndefined();
    expect(exported.actions).toBeUndefined();
    expect(exported.events).toBeUndefined();
    expect(exported.scheduled).toBeUndefined();
  });
});
