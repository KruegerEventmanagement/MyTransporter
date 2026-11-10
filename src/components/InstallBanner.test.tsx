// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

const native = vi.hoisted(() => ({ value: false }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.value } }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) => select({ location: { pathname: "/" } }),
}));

import { InstallBanner } from "./InstallBanner";

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("InstallBanner", () => {
  it("zeigt in der nativen App keinen Install-Hinweis", () => {
    native.value = true;
    render(<InstallBanner />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.queryByText("App installieren")).toBeNull();
  });

  it("zeigt im nicht installierten Browser weiter den PWA-Hinweis", () => {
    native.value = false;
    render(<InstallBanner />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText("App installieren")).toBeTruthy();
  });
});
