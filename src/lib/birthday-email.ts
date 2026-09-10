/**
 * Geburtstagsmail – eigenständiges, mailclient-sicheres HTML (Tabellen +
 * Inline-CSS, keine <style>-Blöcke, keine Web-Fonts). Getestet gegen die
 * Renderer von Gmail, Apple Mail und Outlook.
 */

import { esc, SITE_URL, SUPPORT_EMAIL, COMPANY_ADDRESS, LOGO_URL } from "@/lib/email-template";

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const CORNER_LEFT = `${SITE_URL}/email-botanical-left.png`;
const CORNER_RIGHT = `${SITE_URL}/email-botanical-right.png`;

export interface BirthdayEmailData {
  firstName?: string | null;
  couponCode: string;
  discountPercent: number;
  /** Menschlich lesbares Datum, z. B. "24.09.2026". */
  validUntilLabel: string;
  bookingUrl?: string;
  /** Link zum Widerruf der Geburtstags-E-Mails (Profil). */
  unsubscribeUrl?: string;
}

export function birthdaySubject(firstName?: string | null, percent = 20): string {
  const name = (firstName ?? "").trim();
  return name
    ? `Alles Gute zum Geburtstag, ${name}! 🎉 ${percent} % für deine nächste Fahrt`
    : `Alles Gute zum Geburtstag! 🎉 ${percent} % für deine nächste Fahrt`;
}

export function renderBirthdayEmail(data: BirthdayEmailData): string {
  const bookingUrl = data.bookingUrl ?? `${SITE_URL}/#buchen`;
  const unsubscribeUrl = data.unsubscribeUrl ?? `${SITE_URL}/profil`;
  const greetingName = (data.firstName ?? "").trim();

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>${esc(`Alles Gute zum Geburtstag`)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f4;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Dein persönlicher ${esc(String(data.discountPercent))}-%-Geburtstagsvorteil wartet auf dich.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f4;">
    <tr>
      <td align="center" style="padding:28px 12px 44px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:#ffffff;border:1px solid #e8e8e6;border-radius:22px;">

              <!-- Botanische Ecken + Logo -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="110" align="left" valign="top" style="padding:10px 0 0 8px;">
                    <img src="${CORNER_LEFT}" width="104" height="104" alt="" style="display:block;border:0;width:104px;height:auto;opacity:0.85;" />
                  </td>
                  <td align="center" valign="middle" style="padding:22px 4px 0;">
                    <img src="${LOGO_URL}" width="176" height="59" alt="MyTransporter" style="display:block;border:0;width:176px;height:auto;max-width:100%;margin:0 auto;" />
                  </td>
                  <td width="110" align="right" valign="top" style="padding:10px 8px 0 0;">
                    <img src="${CORNER_RIGHT}" width="104" height="104" alt="" style="display:block;border:0;width:104px;height:auto;opacity:0.85;" />
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:6px 32px 32px;">
                    <h1 style="margin:0 0 6px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:800;color:#000000;text-align:center;">Heute geht’s nur um dich.</h1>
                    <p style="margin:0 0 20px;font-family:${FONT};font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#9a9a97;text-align:center;font-weight:700;">Herzlichen Glückwunsch</p>

                    <p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:#1a1a1a;">${greetingName ? `Hallo ${esc(greetingName)},` : "Hallo,"}</p>
                    <p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:#1a1a1a;">das MyTransporter-Team wünscht dir alles Gute zum Geburtstag, Gesundheit, Erfolg und einen richtig guten Tag.</p>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;">
                      <tr>
                        <td style="padding:14px 18px;border-left:3px solid #111111;background:#fafafa;font-family:${FONT};font-size:15px;line-height:1.6;color:#333333;font-style:italic;">
                          „Man wird nicht älter. Man sammelt nur mehr gute Geschichten.“
                        </td>
                      </tr>
                    </table>

                    <p style="margin:0 0 20px;font-family:${FONT};font-size:15px;line-height:1.65;color:#1a1a1a;">Als kleines Geburtstagsgeschenk bekommst du <strong>${esc(String(data.discountPercent))} % Rabatt</strong> auf deine nächste Transporterbuchung.</p>

                    <!-- Coupon -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
                      <tr>
                        <td align="center" style="padding:24px 18px;background:#111111;border-radius:18px;">
                          <p style="margin:0 0 4px;font-family:${FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#b9b9b6;font-weight:700;">Dein Geburtstagsvorteil</p>
                          <p style="margin:0 0 14px;font-family:${FONT};font-size:40px;line-height:1.1;font-weight:800;color:#ffffff;">${esc(String(data.discountPercent))} %</p>
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 14px;">
                            <tr>
                              <td style="padding:12px 22px;background:#ffffff;border-radius:12px;font-family:'Courier New',Courier,monospace;font-size:19px;font-weight:700;letter-spacing:2px;color:#111111;">${esc(data.couponCode)}</td>
                            </tr>
                          </table>
                          <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:#c9c9c6;">Gültig bis ${esc(data.validUntilLabel)} · einmalig einlösbar</p>
                        </td>
                      </tr>
                    </table>

                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;width:100%;">
                      <tr>
                        <td align="center" bgcolor="#000000" style="border-radius:999px;">
                          <a href="${esc(bookingUrl)}" style="display:block;padding:16px 28px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(String(data.discountPercent))} % Geburtstagsvorteil sichern</a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:0 0 14px;font-family:${FONT};font-size:13px;line-height:1.65;color:#6b6b6b;">Dein persönlicher Code ist 14 Tage gültig und einmalig einlösbar. Du gibst ihn im Buchungsablauf einfach im Feld „Gutscheincode“ ein. Der Rabatt gilt auf den Mietpreis – Kaution und sonstige Kosten bleiben unverändert.</p>

                    <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.65;color:#1a1a1a;">Wir freuen uns, dich bald wieder bei MyTransporter zu sehen.<br />Alles Gute, dein MyTransporter-Team</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 12px 0;">
              <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:1.6;color:#6b6b6b;text-align:center;">
                Fragen? Schreib uns an
                <a href="mailto:${SUPPORT_EMAIL}" style="color:#000000;text-decoration:underline;">${SUPPORT_EMAIL}</a>.
              </p>
              <p style="margin:0 0 6px;font-family:${FONT};font-size:11px;line-height:1.6;color:#9a9a97;text-align:center;">
                Du erhältst diese E-Mail, weil du Geburtstagsvorteile per E-Mail zugestimmt hast.
                <a href="${esc(unsubscribeUrl)}" style="color:#6b6b6b;text-decoration:underline;">Einwilligung widerrufen</a>
              </p>
              <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1.6;color:#9a9a97;text-align:center;">${COMPANY_ADDRESS}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
