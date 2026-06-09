import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPartnerPackageOrNull, formatEuro, formatSqm } from "./partner-packages";

const FROM = process.env.RESEND_FROM_EMAIL || "MyTransporter <info@mytransporter.org>";
const ADMIN_TO = process.env.RESEND_FROM_EMAIL?.match(/<(.+)>/)?.[1] || "info@mytransporter.org";

const Schema = z.object({
  company: z.string().trim().max(120).optional().or(z.literal("")),
  name: z.string().trim().min(1, "Name fehlt").max(120),
  email: z.string().trim().email("Ungültige E-Mail").max(255),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  packageId: z.string().trim().min(1).max(20).regex(/^[A-Z0-9]+$/),
  years: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});

async function sendEmail(to: string, subject: string, html: string, replyTo?: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY missing");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html, reply_to: replyTo }),
  });
  if (!res.ok) {
    console.error("Resend send failed (partner inquiry)", await res.text());
    return false;
  }
  return true;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const submitPartnerInquiry = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Schema.parse(data))
  .handler(async ({ data }) => {
    const pkg = getPartnerPackageOrNull(data.packageId);
    const packageLabel = pkg
      ? `${pkg.viewLabel} ${pkg.code} (${pkg.sizeLabel}, ${formatSqm(pkg.sqm)})`
      : data.packageId;
    const priceLabel = pkg ? `${formatEuro(pkg.monthly)}/Mon.` : "-";
    const yearsLabel = `${data.years} ${data.years === 1 ? "Jahr" : "Jahre"}`;

    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:auto;padding:24px;color:#111;">
        <h2 style="margin:0 0 16px;">Neue Partner-Anfrage</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#666;width:140px;">Firma</td><td>${escapeHtml(data.company || "-")}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Name</td><td>${escapeHtml(data.name)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">E-Mail</td><td>${escapeHtml(data.email)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Telefon</td><td>${escapeHtml(data.phone || "-")}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Fläche</td><td>${escapeHtml(packageLabel)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Preis</td><td>${escapeHtml(priceLabel)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Laufzeit</td><td>${yearsLabel}</td></tr>
        </table>
        ${data.message ? `<div style="margin-top:20px;padding:14px 16px;background:#f5f5f5;border-radius:10px;white-space:pre-wrap;font-size:14px;">${escapeHtml(data.message)}</div>` : ""}
      </div>`;

    const sent = await sendEmail(
      ADMIN_TO,
      `Partner-Anfrage: ${packageLabel} (${yearsLabel})`,
      html,
      data.email,
    );

    await supabaseAdmin.from("admin_notifications").insert({
      type: "partner_inquiry",
      title: `Partner-Anfrage: ${packageLabel}`,
      body: `${data.name}${data.company ? ` (${data.company})` : ""} · ${data.email}${data.phone ? ` · ${data.phone}` : ""} · ${yearsLabel} · ${priceLabel}${data.message ? `\n\n${data.message}` : ""}`,
    });

    return { sent };
  });
