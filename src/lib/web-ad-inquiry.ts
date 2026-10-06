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

export const WebAdInquirySchema = z.object({
  company: z.string().trim().min(2, "Firma fehlt").max(120),
  contactName: z.string().trim().min(2, "Ansprechpartner fehlt").max(120),
  email: z.string().trim().email("Ungültige E-Mail").max(255),
  website: optionalUrl,
  slot: z.enum(["left", "right", "any"]),
  startDate: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Ungültiges Startdatum"),
  message: z.string().trim().max(2000),
  consent: z.literal(true, { errorMap: () => ({ message: "Zustimmung fehlt" }) }),
  /** Honeypot: muss leer bleiben. */
  hp: z.string().max(200).default(""),
});
export type WebAdInquiryInput = z.infer<typeof WebAdInquirySchema>;

export type WebAdInquiryResult =
  | { ok: true; stored: boolean; mailed: boolean }
  | { ok: false; error: string };
