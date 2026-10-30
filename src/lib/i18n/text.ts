import { PAGE_COPY } from "./catalog";
import type { Lang } from "./messages";

const patterns = new Map<Lang, Array<{ pattern: RegExp; translation: string }>>();
const germanMonths = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const locales: Record<Lang, string> = { de: "de-DE", en: "en-GB", ru: "ru-RU", ar: "ar", tr: "tr-TR", it: "it-IT", el: "el-GR" };

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
  const dateMatch = /(?:(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),? )?(\d{1,2})\. (Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember) (\d{4})/u.exec(key);
  if (dateMatch) {
    const month = germanMonths.indexOf(dateMatch[3]);
    if (month >= 0) {
      const date = new Date(Date.UTC(Number(dateMatch[4]), month, Number(dateMatch[2]), 12));
      const formatted = new Intl.DateTimeFormat(locales[lang], { day: "numeric", month: "long", year: "numeric", ...(dateMatch[1] ? { weekday: "long" } : {}), timeZone: "Europe/Berlin" }).format(date);
      return translateText(source.replace(dateMatch[0], formatted), lang);
    }
  }
  for (const { pattern, translation } of templatePatterns(lang)) {
    const match = pattern.exec(key);
    if (match) return source.replace(source.trim(), translation.replace(/\{(\d+)\}/g, (_, index) => match[Number(index) + 1] ?? ""));
  }
  return source;
}