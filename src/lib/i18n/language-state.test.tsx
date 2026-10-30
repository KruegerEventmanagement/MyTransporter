// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LanguageProvider, useI18n } from "./index";
import { Localized } from "./Localized";
import { PAGE_COPY } from "./catalog";
import { LANGS } from "./messages";

afterEach(() => { cleanup(); localStorage.clear(); });

function Probe() {
  const { lang, setLang } = useI18n();
  return <><button onClick={() => setLang("el")}>Greek</button><button onClick={() => setLang("de")}>German</button><output data-testid="language">{lang}</output><input aria-label="draft" defaultValue="" /><Localized><p>Buche deinen Transporter</p></Localized></>;
}

describe("global language state", () => {
  it("switches immediately, persists the selection and preserves entered form data", () => {
    render(<LanguageProvider><Probe /></LanguageProvider>);
    fireEvent.change(screen.getByLabelText("draft"), { target: { value: "existing booking input" } });
    fireEvent.click(screen.getByText("Greek"));
    expect(screen.getByTestId("language").textContent).toBe("el");
    expect(localStorage.getItem("mt-lang")).toBe("el");
    expect(document.documentElement.lang).toBe("el");
    expect((screen.getByLabelText("draft") as HTMLInputElement).value).toBe("existing booking input");
    fireEvent.click(screen.getByText("German"));
    expect(screen.getByTestId("language").textContent).toBe("de");
    expect((screen.getByLabelText("draft") as HTMLInputElement).value).toBe("existing booking input");
  });
  it("restores the previously selected language after hydration", () => {
    localStorage.setItem("mt-lang", "ar");
    render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId("language").textContent).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });
  it("keeps every static catalog complete and template values intact", () => {
    const sourceKeys = Object.keys(PAGE_COPY.de).sort();
    expect(sourceKeys.length).toBeGreaterThan(2000);
    for (const { code } of LANGS) {
      expect(Object.keys(PAGE_COPY[code]).sort()).toEqual(sourceKeys);
      for (const key of sourceKeys) {
        expect(PAGE_COPY[code][key].trim().length).toBeGreaterThan(0);
        expect(PAGE_COPY[code][key].match(/\{\d+\}/g)?.sort() ?? []).toEqual(key.match(/\{\d+\}/g)?.sort() ?? []);
      }
    }
  });
});