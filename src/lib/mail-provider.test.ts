import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildGmailRaw } from '@/lib/gmail-mail-format';
import { preparedGmailMailProvider, resendMailProvider, sendEmailDetailed } from '@/lib/mail-provider.server';
import type { MailSendArgs } from '@/lib/mail-provider';
const args: MailSendArgs = { from: 'MyTransporter <info@mytransporter.org>', to: 'recipient@example.org',
  subject: 'Buchungsbestätigung', html: '<p>Grüße</p>', text: 'Grüße', idempotencyKey: 'mt-confirmation-booking-123',
  attachments: [{ filename: 'Rechnung-Krüger.pdf', content: 'JVBERi0xLjc=' }],
  headers: { 'List-Unsubscribe': '<https://mytransporter.org/unsubscribe>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
afterEach(() => vi.unstubAllEnvs());
describe('provider preparation', () => {
  it('environment cannot enable legacy Resend fallback', async () => {
    vi.stubEnv('MAIL_PROVIDER', 'gmail'); vi.stubEnv('RESEND_API_KEY', 'mock-key');
    const f = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response('{"id":"resend-id"}'));
    expect(await sendEmailDetailed({ ...args, fetchImpl: f })).toMatchObject({ ok: false, kind: 'provider_not_ready' });
    expect(f).not.toHaveBeenCalled();
  });
  it('blocks Gmail without any network call', async () => {
    const f = vi.fn();
    expect(await preparedGmailMailProvider.send({ ...args, fetchImpl: f })).toMatchObject({ ok: false, kind: 'provider_not_ready', ambiguous: false });
    expect(f).not.toHaveBeenCalled();
    expect(preparedGmailMailProvider.supportsProviderIdempotency).toBe(false);
    expect(resendMailProvider.supportsProviderIdempotency).toBe(true);
  });
  it('never falls back to Gmail on Resend failure', async () => {
    vi.stubEnv('RESEND_API_KEY', 'mock-key');
    const f = vi.fn(async () => new Response('{"name":"invalid_api_key"}', { status: 401 }));
    expect(await resendMailProvider.send({ ...args, fetchImpl: f })).toMatchObject({ ok: false, kind: 'invalid_key' });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('encodes owner identity, UTF-8 and archived PDF bytes', async () => {
    const raw = await buildGmailRaw(args), mime = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
    expect(mime).toContain('Reply-To: info@mytransporter.org');
    const name = btoa(String.fromCharCode(...new TextEncoder().encode('Christian Krüger – MyTransporter')));
    expect(mime).toContain(`From: =?UTF-8?B?${name}?= <info@mytransporter.org>`);
    expect(mime).toContain('JVBERi0xLjc=');
    expect(mime).toContain("filename*=UTF-8''Rechnung-Kr%C3%BCger.pdf");
    expect(mime).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
    expect(raw).not.toMatch(/[+/=]/);
    expect(await buildGmailRaw(args)).toBe(raw);
    expect(await buildGmailRaw({ ...args, idempotencyKey: 'different' })).not.toBe(raw);
  });
  it.each([{ to: 'victim@example.org\r\nBcc: other@example.org' }, { subject: 's\r\nFrom: attacker' },
    { headers: { Bcc: 'other@example.org' } }, { attachments: [{ filename: 'x\r\ny.pdf', content: 'JVBE' }] },
    { attachments: [{ filename: 'x.pdf', content: 'not base64!' }] }])('rejects injection and invalid attachments %j', async override => {
    await expect(buildGmailRaw({ ...args, ...override })).rejects.toThrow();
  });
});
