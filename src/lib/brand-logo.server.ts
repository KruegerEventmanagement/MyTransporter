/**
 * Offizielles MyTransporter-Logo für PDFs (Rechnungen, Angebote, Dokumente).
 *
 * Die Bytes werden zur Build-Zeit als Data-URI in das Server-Bundle inliniert.
 * Damit funktioniert der Rechnungskopf auch ohne Netzwerk/Request-Kontext
 * (Hintergrundjobs, Webhook-Verarbeitung). Nur falls das Inlining einmal
 * fehlschlägt, wird der gehostete Asset-Pfad als Fallback geladen.
 */
import type { PDFDocument, PDFImage } from "pdf-lib";
import { getRequest } from "@tanstack/react-start/server";
import logoDataUri from "@/assets/logo.png?inline";
import logoAsset from "@/assets/invoice-logo.png.asset.json";

function dataUriToBytes(uri: string): Uint8Array | null {
  const idx = uri.indexOf("base64,");
  if (idx < 0) return null;
  const b64 = uri.slice(idx + 7);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function fetchHostedLogo(): Promise<Uint8Array | null> {
  try {
    let origin = "https://mytransporter.org";
    try {
      const req = getRequest();
      const proto = req.headers.get("x-forwarded-proto") ?? "https";
      const host = req.headers.get("host");
      if (host) origin = `${proto}://${host}`;
    } catch {
      /* kein Request-Kontext – Fallback-Origin nutzen */
    }
    const res = await fetch(`${origin}${logoAsset.url}`);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Bettet das Marken-Logo ein; `null`, wenn es (sehr unwahrscheinlich) fehlt. */
export async function embedBrandLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  const inlined = typeof logoDataUri === "string" ? dataUriToBytes(logoDataUri) : null;
  if (inlined) {
    try {
      return await pdf.embedPng(inlined);
    } catch (e) {
      console.warn("[pdf] Inline-Logo konnte nicht eingebettet werden:", e);
    }
  }
  const hosted = await fetchHostedLogo();
  if (!hosted) return null;
  try {
    return await pdf.embedPng(hosted);
  } catch {
    return null;
  }
}
