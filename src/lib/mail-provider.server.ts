import type { DetailedSendResult, MailProvider, MailSendArgs } from '@/lib/mail-provider';
import { sendViaResend } from '@/lib/resend-mail-provider.server';

// No runtime toggle or failover: connecting Gmail must not switch old intents.
export const resendMailProvider: MailProvider = {
  id: 'resend', supportsProviderIdempotency: true, send: sendViaResend,
};
// App connectors support server automation, but none is linked here. Gmail
// cannot deduplicate ambiguous retries using Resend's 23-hour guarantee.
// A transport may only be added after linking and durable provider-bound claims.
export const preparedGmailMailProvider: MailProvider = {
  id: 'gmail', supportsProviderIdempotency: false,
  send: async () => ({ ok: false, kind: 'provider_not_ready', ambiguous: false,
    status: null, error: 'Gmail gesperrt: Kontoverbindung und providergebundene Wiederholungssperren zuerst prüfen' }),
};
export function sendEmailDetailed(args: MailSendArgs): Promise<DetailedSendResult> {
  return resendMailProvider.send(args);
}
