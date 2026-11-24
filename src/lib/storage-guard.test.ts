import { describe, expect, it } from "vitest";
import { STORAGE_GUARD_SCRIPT } from "./storage-guard";

function runIn(win: Record<string, unknown>) {
  new Function("window", STORAGE_GUARD_SCRIPT)(win);
}

describe("storage-guard", () => {
  it("ersetzt gesperrten Speicher (SecurityError) durch nutzbaren Arbeitsspeicher", () => {
    const win: Record<string, unknown> = {};
    Object.defineProperty(win, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
    runIn(win);
    const ls = win["localStorage"] as Storage;
    ls.setItem("a", "1");
    expect(ls.getItem("a")).toBe("1");
  });
  it("lässt funktionierenden Speicher unverändert", () => {
    const real = { setItem() {}, removeItem() {}, getItem() { return null; } };
    const win: Record<string, unknown> = { localStorage: real, sessionStorage: real };
    runIn(win);
    expect(win["localStorage"]).toBe(real);
  });
});
