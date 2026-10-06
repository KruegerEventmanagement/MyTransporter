import { z } from "zod";

/** Direkt vermietete Website-Werbeplätze (nicht AdSense). */
export const WEB_AD_PRICE_NET_EUR = 29;
export const WEB_AD_TERM_DAYS = 30;
export const WEB_AD_SLOTS = {
  left: "Desktop-Seitenplatz links",
  right: "Desktop-Seitenplatz rechts",
  any: "Egal / nach Verfügbarkeit",
} as const;
export type WebAdSlot = keyof typeof WEB_AD_SLOTS;

const optionalUrl = z
  .string()
  .trim()
  .max(255)
  .refine((v) => v === "" || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v), "Bitte eine gültige Website (https://…) angeben.");

/** Echtes Kalenderdatum JJJJ-MM-TT (kein 2026-02-31). */
export function isRealCalendarDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Heutiges Kalenderdatum in Europe/Berlin als JJJJ-MM-TT. */
export function berlinToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const WebAdInquirySchema = z.object({
  company: z.string().trim().min(2, "Firma fehlt").max(120),
  contactName: z.string().trim().min(2, "Ansprechpartner fehlt").max(120),
  email: z.string().trim().email("Ungültige E-Mail").max(255),
  website: optionalUrl,
  slot: z.enum(["left", "right", "any"]),
  startDate: z
    .string()
    .trim()
    .refine((v) => v === "" || isRealCalendarDate(v), "Ungültiges Startdatum")
    .refine((v) => v === "" || !isRealCalendarDate(v) || v >= berlinToday(), "Startdatum liegt in der Vergangenheit"),
  message: z.string().trim().max(2000),
  consent: z.literal(true, { errorMap: () => ({ message: "Zustimmung fehlt" }) }),
  /** Honeypot: muss leer bleiben. */
  hp: z.string().max(200).default(""),
});
export type WebAdInquiryInput = z.infer<typeof WebAdInquirySchema>;

export type WebAdInquiryResult =
  | { ok: true; stored: boolean; mailed: boolean }
  | { ok: false; error: string };
