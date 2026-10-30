import { PAGE_COPY } from "./catalog";
import type { Lang } from "./messages";

export function translateText(source: string, lang: Lang): string {
  if (lang === "de" || !source.trim()) return source;
  const key = source.replace(/\s+/g, " ").trim();
  const translated = PAGE_COPY[lang][key];
  if (translated) return source.replace(source.trim(), translated);
  return source;
}