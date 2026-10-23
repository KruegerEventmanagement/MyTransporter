import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capacitorAppId } from "../../../scripts/capacitor-identity";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

describe("Android handover identity", () => {
  it("selects the new Android package", () => {
    expect(capacitorAppId(["node", "cap", "sync", "android"])).toBe("de.mytransporterr.app");
    expect(capacitorAppId([], "android")).toBe("de.mytransporterr.app");
    expect(capacitorAppId([])).toBe("de.mytransporterr.app");
  });
  it("preserves iOS identity", () => {
    expect(capacitorAppId(["node", "cap", "sync", "ios"])).toBe("de.mytransporter.app");
    expect(capacitorAppId([], "ios")).toBe("de.mytransporter.app");
    const identifiers = [...read("ios/App/App.xcodeproj/project.pbxproj").matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)];
    expect(identifiers.map((match) => match[1])).toEqual(["de.mytransporter.app", "de.mytransporter.app"]);
  });
  it("rejects mixed sync and conflicting platform selection", () => {
    expect(() => capacitorAppId(["cap", "sync"])).toThrow(/Select one platform/);
    expect(() => capacitorAppId(["cap", "sync", "android"], "ios")).toThrow(/conflicts/);
    expect(() => capacitorAppId([], "other")).toThrow(/must be android or ios/);
  });
  it("aligns Android identifiers and activity path", () => {
    const gradle = read("android/app/build.gradle");
    expect(gradle).toContain('namespace "de.mytransporterr.app"');
    expect(gradle).toContain('applicationId "de.mytransporterr.app"');
    expect(read("android/app/src/main/java/de/mytransporterr/app/MainActivity.java")).toContain("package de.mytransporterr.app;");
    expect(existsSync(new URL("../../../android/app/src/main/java/de/mytransporter/app/MainActivity.java", import.meta.url))).toBe(false);
    const strings = read("android/app/src/main/res/values/strings.xml");
    expect(strings).toContain('<string name="package_name">de.mytransporterr.app</string>');
    expect(read("android/app/src/main/AndroidManifest.xml")).toContain('android:authorities="${applicationId}.fileprovider"');
  });
  it("blocks push-triggered Play uploads even with complete credentials", () => {
    const workflow = read(".github/workflows/android.yml");
    expect(workflow).toMatch(/upload_to_play:[\s\S]*?type: boolean[\s\S]*?default: false/);
    expect(workflow).toContain("UPLOAD_REQUESTED: ${{ github.event_name == 'workflow_dispatch' && inputs.upload_to_play == true }}");
    expect(workflow).toContain('[ -n "$PLAY" ] && [ "$UPLOAD_REQUESTED" = "true" ]');
    expect(workflow).toContain("- if: github.event_name == 'workflow_dispatch' && inputs.upload_to_play == true && steps.cfg.outputs.upload == 'true'\n        name: Upload zu Google Play");
    expect(workflow).toContain("packageName: de.mytransporterr.app");
  });
});