import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { MESSAGES, RTL_LANGS, parseLang, type Lang, type MsgKey } from "./messages";

export { LANGS, parseLang, type Lang, type MsgKey } from "./messages";

const STORAGE_KEY = "mt-lang";

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: MsgKey) => string;
}

const I18nContext = createContext<I18nValue>({
  lang: "de",
  setLang: () => {},
  t: (k) => MESSAGES.de[k],
});

/** SSR rendert immer Deutsch; gespeicherte Sprache erst nach Hydration. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("de");

  useEffect(() => {
    const fromUrl = parseLang(new URLSearchParams(window.location.search).get("lang"));
    let stored: Lang | null = null;
    try {
      stored = parseLang(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      /* Storage gesperrt */
    }
    const next = fromUrl ?? stored;
    if (next) setLangState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL_LANGS.includes(lang) ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: (k) => MESSAGES[lang][k] ?? MESSAGES.de[k] }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
