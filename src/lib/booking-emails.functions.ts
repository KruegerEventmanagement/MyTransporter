import { createServerFn } from "@tanstack/react-start";
import {
  sendEmail,
  escapeHtml,
  getAdminEmail,
} from "@/lib/booking-emails.server";
import { pushToAdmins } from "@/lib/push.functions";
import { renderEmail } from "@/lib/email-template";

const bookingIdValidator = (data: { bookingId: string }) => {
  if (!data?.bookingId || typeof data.bookingId !== "string") {
    throw new Error("bookingId fehlt");
  }
  return { bookingId: data.bookingId };
};

/**
 * Beide Funktionen laufen über die Action-State-Machine: sie holen nur
 * fehlende/fehlgeschlagene Aktionen nach und senden nie doppelt.
 */
export const sendBookingConfirmation = createServerFn({ method: "POST" })
  .inputValidator(bookingIdValidator)
  .handler(async ({ data }) => {
    const { reconcileBookingPostActions } = await import("@/lib/booking-actions.server");
    return reconcileBookingPostActions(data.bookingId, ["customer_confirmation_invoice"]);
  });

export const sendAdminBookingNotification = createServerFn({ method: "POST" })
  .inputValidator(bookingIdValidator)
  .handler(async ({ data }) => {
    const { reconcileBookingPostActions } = await import("@/lib/booking-actions.server");
    return reconcileBookingPostActions(data.bookingId, ["admin_booking_email"]);
  });


export const sendAdminRegistrationNotification = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; firstName?: string; lastName?: string; phone?: string; accountType?: "private" | "business"; companyName?: string; vatId?: string }) => {
    if (!data?.email || typeof data.email !== "string") {
      throw new Error("email fehlt");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const name = [data.firstName, data.lastName].filter(Boolean).join(" ") || "Unbekannt";
    const isBusiness = data.accountType === "business";
    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:auto;padding:24px;color:#111;">
        <h2 style="margin:0 0 16px;">${isBusiness ? "🏢" : "👤"} Neue Registrierung ${isBusiness ? "(Firma)" : "(Privat)"}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${isBusiness ? `<tr><td style="padding:6px 0;color:#666;width:140px;">Firma</td><td><strong>${escapeHtml(data.companyName ?? "-")}</strong></td></tr>` : ""}
          ${isBusiness && data.vatId ? `<tr><td style="padding:6px 0;color:#666;">USt-IdNr.</td><td>${escapeHtml(data.vatId)}</td></tr>` : ""}
          <tr><td style="padding:6px 0;color:#666;width:140px;">Name</td><td><strong>${escapeHtml(name)}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666;">E-Mail</td><td>${escapeHtml(data.email)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Telefon</td><td>${escapeHtml(data.phone ?? "-")}</td></tr>
        </table>
        <p style="margin:24px 0;">
          <a href="https://www.mytransporter.org/admin" style="background:#000;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Im Admin öffnen</a>
        </p>
      </div>`;
    const sent = await sendEmail(
      getAdminEmail(),
      `${isBusiness ? "🏢" : "👤"} Neue Registrierung · ${isBusiness ? (data.companyName || name) : name}`,
      html,
    );

    await pushToAdmins({
      title: "Neue Registrierung",
      body: `${name} · ${data.email}`,
      url: "/admin",
      tag: `signup-${data.email}`,
    }).catch((e) => console.warn("Admin-Push (Registrierung) fehlgeschlagen:", e));

    return { sent };
  });
export const sendWelcomeEmail = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; firstName?: string }) => {
    if (!data?.email || typeof data.email !== "string" || !data.email.includes("@")) {
      throw new Error("E-Mail fehlt");
    }
    return { email: data.email, firstName: data.firstName ?? "" };
  })
  .handler(async ({ data }) => {
    const html = renderEmail({
      firstName: data.firstName,
      heading: "Willkommen bei MyTransporter",
      intro: [
        "dein Konto wurde erfolgreich erstellt. Du kannst deine Buchung jetzt direkt abschließen.",
        "Deine Dokumente (Ausweis und Führerschein) sind in deinem Profil hinterlegt.",
      ],
      button: { label: "Zu meinem Profil", url: "https://www.mytransporter.org/profil" },
    });

    const ok = await sendEmail(data.email, "Willkommen bei MyTransporter", html);
    return { ok };
  });
