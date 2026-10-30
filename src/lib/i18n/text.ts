import { PAGE_COPY } from "./catalog";
import type { Lang } from "./messages";

const patterns = new Map<Lang, Array<{ pattern: RegExp; translation: string }>>();

function templatePatterns(lang: Lang) {
  const cached = patterns.get(lang);
  if (cached) return cached;
  const result = Object.entries(PAGE_COPY[lang]).filter(([key]) => /\{\d+\}/.test(key)).map(([key, translation]) => ({
    pattern: new RegExp("^" + key.split(/(\{\d+\})/).map((part) => /^\{\d+\}$/.test(part) ? "(.+?)" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("") + "$"),
    translation,
  }));
  patterns.set(lang, result);
  return result;
}

export function translateText(source: string, lang: Lang): string {
  if (lang === "de" || !source.trim()) return source;
  const key = source.replace(/\s+/g, " ").trim();
  const translated = PAGE_COPY[lang][key];
  if (translated) return source.replace(source.trim(), translated);
  for (const { pattern, translation } of templatePatterns(lang)) {
    const match = pattern.exec(key);
    if (match) return source.replace(source.trim(), translation.replace(/\{(\d+)\}/g, (_, index) => match[Number(index) + 1] ?? ""));
  }
  return source;
}