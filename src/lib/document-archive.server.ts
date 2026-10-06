/**
 * Zentrales, unveränderliches Belegarchiv für ALLE erzeugten Rechnungen und
 * Angebote. Jeder PDF-Erzeugungspfad ruft archiveIssuedDocument() auf.
 *
 * - PDF liegt im privaten Bucket "issued-documents" (nur Server-Zugriff).
 * - Metadaten + Snapshot in public.issued_documents (Update/Delete per Trigger gesperrt).
 * - Buchungsrechnungen: deterministische Nummer → erste Fassung bleibt maßgeblich,
 *   spätere Neuerzeugungen (Nachversand, Retry) erzeugen KEINEN neuen Eintrag.
 * - Manuelle Dokumente: gleiche Nummer + gleicher Inhalt → kein Duplikat;
 *   geänderter Inhalt → neue Revision, alte bleibt erhalten.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ISSUED_DOCUMENTS_BUCKET = "issued-documents";

export type ArchiveItem = {
  label: string;
  net_cents: number | null;
  vat_cents: number | null;
  gross_cents: number;
  vat_rate: number | null;
};

export type ArchiveInput = {
  kind: "invoice" | "offer";
  source: "booking" | "manual";
  documentNumber: string;
  documentDate: string; // YYYY-MM-DD
  bookingId?: string | null;
  userId?: string | null;
  customerName?: string | null;
  customerCompany?: string | null;
  customerEmail?: string | null;
  billingAddress?: Record<string, unknown> | null;
  items: ArchiveItem[];
  netCents: number;
  vatRate: number;
  vatCents: number;
  grossCents: number;
  nonTaxableCents: number;
  totalCents: number;
  paymentStatus?: string | null;
  snapshot: Record<string, unknown>;
  pdfBase64: string;
  filename: string;
  createdBy?: string | null;
};

export type ArchiveResult = { id: string; revision: number; created: boolean };

/** Stabiles JSON (sortierte Schlüssel) für den Inhalts-Hash. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function safeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "dokument";
}

export async function archiveIssuedDocument(
  input: ArchiveInput,
  client: typeof supabaseAdmin = supabaseAdmin,
): Promise<ArchiveResult> {
  const contentHash = await sha256Hex(stableStringify(input.snapshot));

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: latest, error: selErr } = await client
      .from("issued_documents")
      .select("id, revision, content_hash")
      .eq("kind", input.kind)
      .eq("document_number", input.documentNumber)
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (selErr) throw new Error(`Archiv-Abfrage fehlgeschlagen: ${selErr.message}`);

    if (latest) {
      // Buchungsrechnung: Erstfassung ist der Beleg, nie überschreiben.
      if (input.source === "booking" || latest.content_hash === contentHash) {
        return { id: latest.id, revision: latest.revision, created: false };
      }
    }
    const revision = (latest?.revision ?? 0) + 1;
    const year = input.documentDate.slice(0, 4);
    const path = `${input.kind}/${year}/${safeSegment(input.documentNumber)}-r${revision}-${contentHash.slice(0, 12)}.pdf`;
    const bytes = b64ToBytes(input.pdfBase64);

    const { error: upErr } = await client.storage
      .from(ISSUED_DOCUMENTS_BUCKET)
      .upload(path, bytes, { contentType: "application/pdf", upsert: false });
    // "already exists" = paralleler Lauf mit identischem Inhalt → weiter zur DB.
    if (upErr && !/exist|duplicate/i.test(upErr.message)) {
      throw new Error(`PDF-Ablage fehlgeschlagen: ${upErr.message}`);
    }

    const { data: row, error: insErr } = await client
      .from("issued_documents")
      .insert({
        kind: input.kind,
        source: input.source,
        document_number: input.documentNumber,
        revision,
        document_date: input.documentDate,
        booking_id: input.bookingId ?? null,
        user_id: input.userId ?? null,
        customer_name: input.customerName ?? null,
        customer_company: input.customerCompany ?? null,
        customer_email: input.customerEmail ?? null,
        billing_address: (input.billingAddress ?? null) as never,
        items: input.items as never,
        net_cents: input.netCents,
        vat_rate: input.vatRate,
        vat_cents: input.vatCents,
        gross_cents: input.grossCents,
        non_taxable_cents: input.nonTaxableCents,
        total_cents: input.totalCents,
        payment_status: input.paymentStatus ?? null,
        snapshot: input.snapshot as never,
        content_hash: contentHash,
        pdf_path: path,
        pdf_filename: input.filename,
        pdf_size_bytes: bytes.length,
        created_by: input.createdBy ?? null,
      })
      .select("id, revision")
      .single();
    if (!insErr && row) return { id: row.id, revision: row.revision, created: true };
    // Unique-Konflikt (paralleler Lauf) → erneut lesen.
    if (insErr && insErr.code === "23505") continue;
    throw new Error(`Archiv-Eintrag fehlgeschlagen: ${insErr?.message ?? "unbekannt"}`);
  }
  throw new Error("Archiv-Eintrag nach Wiederholungen nicht möglich");
}
