import { describe, expect, it, vi } from "vitest";
// @ts-expect-error – reines JS-Modul
import { CLIENT_CANDIDATES, FRESH_OUTPUTS, findClientOutput, shouldCopy, spawnArgs } from "../../../scripts/native-build-lib.mjs";
// @ts-expect-error – reines JS-Modul
import { computeAndroidVersion, MAX_VERSION_CODE } from "../../../scripts/android-version.mjs";
import { stableServerFnId } from "./server-fn-id";
import { __resetNativeStart, safeStep } from "./bootstrap";

describe("build-native", () => {
  it("findet Nitro .output/public vor dist", () => {
    const has = (p: string) => p.replace(/\\/g, "/").endsWith(".output/public/_shell.html") || p.endsWith("dist/_shell.html");
    expect(findClientOutput("/r", has)).toBe(".output/public");
  });
  it("findet dist/client", () => {
    expect(findClientOutput("/r", (p: string) => p.replace(/\\/g, "/").endsWith("dist/client/_shell.html"))).toBe("dist/client");
  });
  it("bricht ohne _shell.html klar ab", () => {
    expect(() => findClientOutput("/r", () => false)).toThrow(/_shell.html/);
  });
  it("räumt alle Ausgaben vorher weg", () => {
    expect(FRESH_OUTPUTS).toEqual(expect.arrayContaining([".output", "dist", "dist-native.tmp"]));
    expect(CLIENT_CANDIDATES[0]).toBe(".output/public");
  });
  it("kopiert nur Client-Assets, ohne Service Worker", () => {
    expect(shouldCopy("sw.js")).toBe(false);
    expect(shouldCopy("server/index.mjs")).toBe(false);
    expect(shouldCopy("assets/a.js.map")).toBe(false);
    expect(shouldCopy("assets/a.js")).toBe(true);
    expect(shouldCopy("sw-target.js")).toBe(true);
  });
  it("Windows-kompatibler spawn", () => {
    expect(spawnArgs("win32")).toMatchObject({ cmd: "npx.cmd", shell: true });
    expect(spawnArgs("linux")).toMatchObject({ cmd: "npx", shell: false });
  });
});

describe("android version", () => {
  it("monoton aus run_number/attempt mit Offset", () => {
    const a = computeAndroidVersion({ GITHUB_RUN_NUMBER: "5", GITHUB_RUN_ATTEMPT: "1", GITHUB_SHA: "abcdef123" });
    const b = computeAndroidVersion({ GITHUB_RUN_NUMBER: "5", GITHUB_RUN_ATTEMPT: "2" });
    const c = computeAndroidVersion({ GITHUB_RUN_NUMBER: "6", GITHUB_RUN_ATTEMPT: "1" });
    expect(a).toEqual({ versionCode: 1051, versionName: "1.0.5-abcdef1" });
    expect(b.versionCode).toBeGreaterThan(a.versionCode);
    expect(c.versionCode).toBeGreaterThan(b.versionCode);
    expect(computeAndroidVersion({ GITHUB_RUN_NUMBER: "5", GITHUB_RUN_ATTEMPT: "40" }).versionCode).toBeLessThan(c.versionCode);
  });
  it("validiert Grenzen", () => {
    expect(() => computeAndroidVersion({})).toThrow();
    expect(() => computeAndroidVersion({ GITHUB_RUN_NUMBER: "0" })).toThrow();
    expect(() => computeAndroidVersion({ GITHUB_RUN_NUMBER: String(MAX_VERSION_CODE) })).toThrow(/außerhalb/);
  });
});

describe("stableServerFnId", () => {
  it("gleich in verschiedenen Build-Verzeichnissen", () => {
    const a = stableServerFnId("/dev-server/src/lib/x.functions.ts", "f", "/dev-server");
    const b = stableServerFnId("/home/runner/work/MT/MT/src/lib/x.functions.ts?tsr-split", "f", "/home/runner/work/MT/MT");
    const w = stableServerFnId("C:\\a\\src\\lib\\x.functions.ts", "f", "C:\\a");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(stableServerFnId("/r/src/lib/x.functions.ts", "g", "/r")).not.toBe(a);
    if (process.platform === "win32") expect(w).toBe(a);
  });
});

describe("safeStep", () => {
  it("fängt Fehler und Hänger ab", async () => {
    __resetNativeStart();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await safeStep("ok", () => 1)).toBe(true);
    expect(await safeStep("err", () => Promise.reject(new Error("x")))).toBe(false);
    expect(await safeStep("sync-throw", () => { throw new Error("y"); })).toBe(false);
    expect(await safeStep("hang", () => new Promise(() => {}), 20)).toBe(false);
    warn.mockRestore();
  });
});
