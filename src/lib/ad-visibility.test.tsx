// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { areAdsSuppressed, setAdsSuppressed, useSuppressAds } from "./ad-visibility";

function Source({ active }: { active: boolean }) {
  useSuppressAds(active);
  return null;
}

afterEach(() => {
  cleanup();
  setAdsSuppressed(false);
});

describe("quellenbasierte Werbeunterdrückung", () => {
  it("inaktive Quelle gibt aktive Quelle nicht frei", () => {
    const { rerender } = render(
      <>
        <Source active={true} />
        <Source active={false} />
      </>,
    );
    expect(areAdsSuppressed()).toBe(true);
    rerender(
      <>
        <Source active={true} />
        <Source active={true} />
      </>,
    );
    rerender(
      <>
        <Source active={true} />
        <Source active={false} />
      </>,
    );
    expect(areAdsSuppressed()).toBe(true);
    rerender(
      <>
        <Source active={false} />
        <Source active={false} />
      </>,
    );
    expect(areAdsSuppressed()).toBe(false);
  });

  it("Unmount einer Quelle gibt andere nicht frei; manueller Schalter bleibt erhalten", () => {
    const { rerender } = render(
      <>
        <Source active={true} />
        <Source active={true} />
      </>,
    );
    rerender(<Source active={true} />);
    expect(areAdsSuppressed()).toBe(true);
    cleanup();
    expect(areAdsSuppressed()).toBe(false);
    act(() => setAdsSuppressed(true));
    render(<Source active={false} />);
    expect(areAdsSuppressed()).toBe(true);
  });
});
