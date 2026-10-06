import { z } from "zod";

export const docItemSchema = z.object({
  label: z.string().trim().min(1).max(120),
  amount: z.number().finite().min(-1000000).max(1000000),
  mode: z.enum(["net", "gross"]),
  vat: z.boolean(),
});

export const docInputSchema = z.object({
  kind: z.enum(["invoice", "offer"]),
  number: z.string().trim().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recipient: z.object({
    company: z.string().trim().max(120).optional(),
    attention: z.string().trim().max(120).optional(),
    street: z.string().trim().max(120).optional(),
    city: z.string().trim().max(120).optional(),
    email: z.string().trim().email().max(200).optional().or(z.literal("")),
    vatId: z.string().trim().max(40).optional(),
  }),
  service: z.object({
    vehicle: z.string().trim().max(120).optional(),
    vin: z.string().trim().max(60).optional(),
    pickup: z.string().trim().max(80).optional(),
    ret: z.string().trim().max(80).optional(),
    freeKm: z.number().int().min(0).max(1000000).nullable().optional(),
    kmPrice: z.number().min(0).max(100).nullable().optional(),
  }),
  items: z.array(docItemSchema).min(1).max(30),
  note: z.string().trim().max(600).optional(),
  bookingId: z.string().uuid().optional().or(z.literal("")),
});

export const sendDocSchema = z.object({
  doc: docInputSchema,
  to: z.string().trim().email().max(200),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().max(3000),
});

export type DocInputData = z.infer<typeof docInputSchema>;

export const listDocsSchema = z.object({
  kind: z.enum(["all", "invoice", "offer"]).default("all"),
  q: z.string().trim().max(120).default(""),
});

export const docIdSchema = z.object({ id: z.string().uuid() });
