import { describe, expect, it } from "vitest";
import { deriveVapidKeys } from "./vapid.server";

describe("VAPID-Ableitung", () => {
  it("liefert ein gültiges, stabiles P-256-Paar im web-push-Format", async () => {
    const a = await deriveVapidKeys("x".repeat(64));
    const b = await deriveVapidKeys("x".repeat(64));
    expect(a).toEqual(b);
    expect(a.privateKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
    const webpush = (await import("web-push")).default;
    expect(() => webpush.setVapidDetails("mailto:info@mytransporter.org", a.publicKey, a.privateKey)).not.toThrow();
  });
});
