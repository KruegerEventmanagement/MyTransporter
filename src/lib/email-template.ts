/**
 * Gemeinsame Vorlage für alle Kunden-E-Mails von MyTransporter.
 *
 * Bewusst reines HTML mit Tabellen + Inline-CSS, damit Outlook, Gmail
 * und Apple Mail identisch rendern. Keine externen Stylesheets,
 * keine <style>-Blöcke, keine Web-Fonts.
 *
 * Alle dynamischen Inhalte MÜSSEN durch esc() laufen.
 */

export const SUPPORT_EMAIL = "info@mytransporter.org";
export const SITE_URL = "https://www.mytransporter.org";
/** Offizielles MyTransporter-Logo (Wort-/Bildmarke), stabil unter /email-logo.png. */
export const LOGO_URL = `${SITE_URL}/email-logo.png`;

export const COMPANY_ADDRESS = "MyTransporter · Römerstraße 36 · 71229 Leonberg";

/** HTML-Escaping für alle dynamischen Werte. */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailRow {
  label: string;
  value: string;
  /** Wert ist bereits sicheres HTML (z. B. <code>-Auszeichnung). */
  raw?: boolean;
}

export interface EmailOptions {
  /** Vorname o. Ä., wird escaped. Leer ⇒ neutrale Anrede. */
  firstName?: string | null;
  /** Große Überschrift oben im Inhalt. */
  heading: string;
  /** Absätze unter der Anrede (Plain-Text, wird escaped). */
  intro?: string[];
  /** Mietdaten-Tabelle. */
  rows?: EmailRow[];
  /** Optionale Karten-Überschrift für die Datentabelle. */
  rowsTitle?: string;
  button?: { label: string; url: string };
  /** Freier, bereits sicherer HTML-Block unter dem Button. */
  extraHtml?: string;
  /** Absätze nach dem Button (Plain-Text, wird escaped). */
  outro?: string[];
  /** Grußformel unterdrücken (z. B. bei rein interner Mail). */
  omitSignature?: boolean;
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function greeting(firstName?: string | null): string {
  const name = (firstName ?? "").trim();
  return name ? `Hallo ${esc(name)},` : "Hallo,";
}

function paragraphs(items: string[] | undefined, escape = true): string {
  if (!items || items.length === 0) return "";
  return items
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:#1a1a1a;">${escape ? esc(p) : p}</p>`,
    )
    .join("");
}

function dataTable(rows: EmailRow[] | undefined, title?: string): string {
  if (!rows || rows.length === 0) return "";
  const body = rows
    .map(
      (r) => `
              <tr>
                <td style="padding:9px 0;font-family:${FONT};font-size:13px;color:#6b6b6b;width:44%;vertical-align:top;">${esc(r.label)}</td>
                <td style="padding:9px 0;font-family:${FONT};font-size:14px;color:#111111;font-weight:600;vertical-align:top;">${r.raw ? r.value : esc(r.value)}</td>
              </tr>`,
    )
    .join("");
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f6;border-radius:14px;margin:4px 0 22px;">
          <tr>
            <td style="padding:18px 20px;">
              ${title ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8a8a8a;font-weight:700;">${esc(title)}</p>` : ""}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}
              </table>
            </td>
          </tr>
        </table>`;
}

function button(btn: EmailOptions["button"]): string {
  if (!btn) return "";
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 24px;">
          <tr>
            <td align="center" bgcolor="#000000" style="border-radius:999px;">
              <a href="${esc(btn.url)}" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(btn.label)}</a>
            </td>
          </tr>
        </table>`;
}

/** Erzeugt das vollständige, mailclient-sichere HTML-Dokument. */
export function renderEmail(opts: EmailOptions): string {
  const signature = opts.omitSignature
    ? ""
    : `
        <p style="margin:24px 0 0;font-family:${FONT};font-size:15px;line-height:1.6;color:#1a1a1a;">
          Herzliche Grüße<br />Dein MyTransporter-Team
        </p>`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>${esc(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:24px 12px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <!-- Offizielles Logo -->
          <tr>
            <td align="center" style="padding:8px 0 22px;">
              <img src="${LOGO_URL}" width="192" height="64" alt="MyTransporter" style="display:block;border:0;width:192px;height:auto;max-width:100%;margin:0 auto;" />
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;border:1px solid #ececec;border-radius:18px;padding:26px 24px;">
              <h1 style="margin:0 0 14px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:800;color:#000000;">${esc(opts.heading)}</h1>
              <p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:#1a1a1a;">${greeting(opts.firstName)}</p>
              ${paragraphs(opts.intro)}
              ${dataTable(opts.rows, opts.rowsTitle)}
              ${button(opts.button)}
              ${opts.extraHtml ?? ""}
              ${paragraphs(opts.outro)}
              ${signature}
            </td>
          </tr>
          <!-- Support / Footer -->
          <tr>
            <td style="padding:18px 8px 0;">
              <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:1.6;color:#6b6b6b;">
                Fragen? Schreib uns einfach an
                <a href="mailto:${SUPPORT_EMAIL}" style="color:#000000;text-decoration:underline;">${SUPPORT_EMAIL}</a>.
              </p>
              <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1.6;color:#9a9a9a;">${COMPANY_ADDRESS}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Kleiner Hinweisblock (bereits sicheres HTML) für Zusatzinfos. */
export function noteBlock(html: string): string {
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
          <tr>
            <td style="padding:14px 16px;background:#fafafa;border:1px solid #ececec;border-radius:12px;font-family:${FONT};font-size:13px;line-height:1.6;color:#4a4a4a;">${html}</td>
          </tr>
        </table>`;
}

/** Aufzählung als HTML-Liste, Einträge werden escaped. */
export function listBlock(title: string, items: string[]): string {
  if (items.length === 0) return "";
  return `
        <p style="margin:0 0 8px;font-family:${FONT};font-size:15px;font-weight:700;color:#111111;">${esc(title)}</p>
        <ul style="margin:0 0 20px;padding-left:20px;font-family:${FONT};font-size:14px;line-height:1.7;color:#1a1a1a;">
          ${items.map((i) => `<li>${esc(i)}</li>`).join("")}
        </ul>`;
}

/** Aufzählung mit bereits sicherem HTML pro Eintrag. */
export function rawListBlock(title: string, itemsHtml: string[]): string {
  if (itemsHtml.length === 0) return "";
  return `
        <p style="margin:0 0 8px;font-family:${FONT};font-size:15px;font-weight:700;color:#111111;">${esc(title)}</p>
        <ul style="margin:0 0 20px;padding-left:20px;font-family:${FONT};font-size:14px;line-height:1.7;color:#1a1a1a;">
          ${itemsHtml.map((i) => `<li>${i}</li>`).join("")}
        </ul>`;
}
