import type { MailSendArgs } from '@/lib/mail-provider';
export const GMAIL_BOOKING_ACCOUNT = 'info@mytransporter.org';
export const GMAIL_BOOKING_NAME = 'Christian Krüger – MyTransporter';
function clean(v: string) {
  if (/[\r\n\0]/.test(v)) throw new Error('Ungültige Mail-Kopfzeile');
  return v;
}
function base64(v: string) {
  const bytes = new TextEncoder().encode(v);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin);
}
function header(v: string) {
  clean(v);
  return /^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${base64(v)}?=`;
}
const wrap = (v: string) => v.match(/.{1,76}/g)?.join('\r\n') ?? '';
/** MIME preparation only. Message-ID is NOT a Gmail deduplication guarantee. */
export async function buildGmailRaw(args: MailSendArgs): Promise<string> {
  const to = clean(args.to.trim());
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(to)) throw new Error('Ungültiger Empfänger');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(args.idempotencyKey));
  const key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const mixed = `mt_mixed_${key}`, alt = `mt_alt_${key}`;
  const lines = [`From: ${header(GMAIL_BOOKING_NAME)} <${GMAIL_BOOKING_ACCOUNT}>`, `To: ${to}`,
    `Reply-To: ${GMAIL_BOOKING_ACCOUNT}`, `Subject: ${header(args.subject)}`,
    `Message-ID: <mt-${key}@mytransporter.org>`, 'MIME-Version: 1.0'];
  for (const [name, value] of Object.entries(args.headers ?? {})) {
    if (!['list-unsubscribe', 'list-unsubscribe-post'].includes(name.toLowerCase())) throw new Error('Nicht unterstützte Kopfzeile');
    lines.push(`${clean(name)}: ${clean(value)}`);
  }
  lines.push(`Content-Type: multipart/mixed; boundary="${mixed}"`, '', `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`, '');
  for (const [type, content] of [['text/plain', args.text ?? ''], ['text/html', args.html]]) {
    lines.push(`--${alt}`, `Content-Type: ${type}; charset="UTF-8"`, 'Content-Transfer-Encoding: base64', '', wrap(base64(content)));
  }
  lines.push(`--${alt}--`);
  for (const att of args.attachments ?? []) {
    const filename = clean(att.filename), content = att.content.replace(/\s/g, '');
    if (!filename || /["\\]/.test(filename)) throw new Error('Ungültiger Anhangname');
    if (!content || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) throw new Error('Ungültige Anhangdaten');
    const encoded = encodeURIComponent(filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    const mimeType = /\.pdf$/i.test(filename) ? 'application/pdf' : 'application/octet-stream';
    lines.push(`--${mixed}`, `Content-Type: ${mimeType}`,
      `Content-Disposition: attachment; filename*=UTF-8''${encoded}`, 'Content-Transfer-Encoding: base64', '', wrap(content));
  }
  lines.push(`--${mixed}--`, '');
  return base64(lines.join('\r\n')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
