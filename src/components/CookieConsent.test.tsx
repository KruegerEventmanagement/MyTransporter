// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import { CookieConsent } from "./CookieConsent";
import { CONSENT_STORAGE_KEY } from "@/lib/analytics";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("CookieConsent – Wegklicken", () => {
  it("schließt den Hinweis per X, ohne eine Einwilligung zu speichern", () => {
    render(<CookieConsent />);
    expect(screen.getByRole("dialog", { name: "Cookie-Einstellungen" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cookie-Hinweis schließen" }));
    expect(screen.queryByRole("dialog", { name: "Cookie-Einstellungen" })).toBeNull();
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
  });
});
