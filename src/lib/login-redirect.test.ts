// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { LOCAL_TARGET_TTL_MS, requireLogin, takeLoginRedirect } from "./login-redirect";

describe("Rücksprung nach Login aus dem Mail-Link", () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
  it("springt zur Fahrt zurück, auch wenn sessionStorage verloren ging", () => {
    requireLogin(() => {}, "/trip/abc-123");
    sessionStorage.clear();
    expect(takeLoginRedirect()).toBe("/trip/abc-123");
    expect(takeLoginRedirect()).toBeNull();
  });
  it("verwirft abgelaufene lokale Ziele", () => {
    requireLogin(() => {}, "/trip/abc-123");
    sessionStorage.clear();
    expect(takeLoginRedirect(Date.now() + LOCAL_TARGET_TTL_MS + 1000)).toBeNull();
  });
  it("lässt keine externen Ziele zu", () => {
    requireLogin(() => {}, "https://boese.example/trip");
    expect(takeLoginRedirect()).toBeNull();
  });
});
