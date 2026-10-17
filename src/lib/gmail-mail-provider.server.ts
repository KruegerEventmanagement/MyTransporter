import type { DetailedSendResult, MailSendArgs } from '@/lib/mail-provider';
import { buildGmailRaw, GMAIL_BOOKING_ACCOUNT } from '@/lib/gmail-mail-format';

const GATEWAY = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1';
// Human release required after review. Linking alone never enables send.
export const GMAIL_SEND_RELEASED = false;
export type GmailDeps = {
  enabled: boolean; fetch: typeof fetch; gatewayKey: string; connectionKey: string;
  claim: (key: string, hash: string) => Promise<{ result: string; lease_token?: string; provider_id?: string }>;
  complete: (key: string, token: string, id: string) => Promise<boolean>;
  fail: (key: string, token: string, status: number | null, kind: string, ambiguous: boolean) => Promise<unknown>;
};
const failure = (kind: 'provider_not_ready' | 'other' | 'transient' | 'network' | 'no_provider_id', ambiguous: boolean, status: number | null, error: string): DetailedSendResult => ({ ok: false, kind, ambiguous, status, error });

/** Durable fence is independent of outer leases. A crash after POST is never
 * replayed. Lost local completion is recoverable only from persisted Gmail ID.
 */
export async function sendGmailWithDeps(args: MailSendArgs, deps: GmailDeps): Promise<DetailedSendResult> {
  if (!deps.enabled || !deps.gatewayKey || !deps.connectionKey) return failure('provider_not_ready', false, null, 'Gmail-Versand noch nicht freigegeben');
  let raw: string;
  try { raw = await buildGmailRaw(args); } catch { return failure('other', false, null, 'Ungültige Maildaten'); }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const headers = { Authorization: `Bearer ${deps.gatewayKey}`, 'X-Connection-Api-Key': deps.connectionKey, 'Content-Type': 'application/json' };
  // Read-only account check BEFORE claim/POST; wrong or uncheckable account is fail-closed.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 20_000);
  let token: string | undefined;
  try {
    const profile = await deps.fetch(`${GATEWAY}/users/me/profile?fields=emailAddress`, { headers, signal: ctrl.signal });
    if (!profile.ok) return failure('provider_not_ready', false, profile.status, `Gmail-Kontoprüfung abgelehnt [${profile.status}]`);
    const account = await profile.json() as { emailAddress?: unknown };
    if (account.emailAddress !== GMAIL_BOOKING_ACCOUNT) return failure('provider_not_ready', false, null, 'Gmail-Zielkonto stimmt nicht überein');
    const claim = await deps.claim(args.idempotencyKey, hash);
    if (claim.result === 'sent' && claim.provider_id) return { ok: true, providerId: claim.provider_id };
    if (claim.result !== 'claimed' || !claim.lease_token) return failure('provider_not_ready', claim.result === 'needs_review' || claim.result === 'in_progress', null, `Gmail-Versandsperre: ${claim.result}`);
    token = claim.lease_token;
    const res = await deps.fetch(`${GATEWAY}/users/me/messages/send`, { method: 'POST', headers, body: JSON.stringify({ raw }), signal: ctrl.signal });
    const body = await res.text();
    if (!res.ok) {
      // Never persist provider body: may contain recipients, auth material or mail content.
      const ambiguous = res.status >= 500 || res.status === 408 || res.status === 409;
      const kind = res.status === 429 || res.status >= 500 ? 'transient' : 'other';
      await deps.fail(args.idempotencyKey, token, res.status, kind, ambiguous);
      return failure(kind, ambiguous, res.status, `Gmail-Versand abgelehnt [${res.status}]`);
    }
    let id: unknown;
    try { id = (JSON.parse(body) as { id?: unknown }).id; } catch { /* unknown acceptance */ }
    if (typeof id !== 'string' || !/^[a-fA-F0-9]{8,64}$/.test(id)) {
      await deps.fail(args.idempotencyKey, token, res.status, 'no_provider_id', true);
      return failure('no_provider_id', true, res.status, 'Gmail-Antwort ohne gültige Nachrichten-ID');
    }
    // Completion failure does not authorize resend. Ledger remains ambiguous.
    await deps.complete(args.idempotencyKey, token, id);
    return { ok: true, providerId: id };
  } catch {
    if (token) {
      try { await deps.fail(args.idempotencyKey, token, null, 'network', true); } catch { /* claim remains ambiguous */ }
    }
    return failure('network', !!token, null, 'Gmail-Anfrage nicht sicher abgeschlossen');
  } finally { clearTimeout(timer); }
}

export async function sendViaGmail(args: MailSendArgs): Promise<DetailedSendResult> {
  if (!GMAIL_SEND_RELEASED) return failure('provider_not_ready', false, null, 'Gmail-Versand noch nicht freigegeben');
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  return sendGmailWithDeps(args, {
    enabled: GMAIL_SEND_RELEASED, fetch: args.fetchImpl ?? fetch,
    gatewayKey: process.env.LOVABLE_API_KEY ?? '', connectionKey: process.env.GOOGLE_MAIL_API_KEY ?? '',
    claim: async (key, hash) => {
      const { data, error } = await db.rpc('claim_gmail_attempt', { _key: key, _hash: hash });
      if (error) throw new Error('Gmail-Versandsperre nicht lesbar');
      return data as unknown as { result: string; lease_token?: string; provider_id?: string };
    },
    complete: async (key, token, id) => {
      const { data, error } = await db.rpc('complete_gmail_attempt', { _key: key, _token: token, _provider_id: id });
      if (error) throw new Error('Gmail-Annahme nicht protokollierbar');
      return data === true;
    },
    fail: async (key, token, status, kind, ambiguous) => {
      const { error } = await db.rpc('fail_gmail_attempt', { _key: key, _token: token, _status: status as number, _kind: kind, _ambiguous: ambiguous });
      if (error) throw new Error('Gmail-Fehler nicht protokollierbar');
    },
  });
}
