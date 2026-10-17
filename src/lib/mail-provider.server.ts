import type { DetailedSendResult, MailProvider, MailSendArgs } from '@/lib/mail-provider';
import { sendViaGmail } from '@/lib/gmail-mail-provider.server';
import { sendViaResend } from '@/lib/resend-mail-provider.server';

// No runtime toggle or failover: connecting Gmail must not switch old intents.
export const resendMailProvider: MailProvider = {
  id: 'resend', supportsProviderIdempotency: true, send: sendViaResend,
};
export const preparedGmailMailProvider: MailProvider = {
  id: 'gmail', supportsProviderIdempotency: false, send: sendViaGmail,
};
export function sendEmailDetailed(args: MailSendArgs): Promise<DetailedSendResult> {
  if (args.provider === 'gmail') return preparedGmailMailProvider.send(args);
  // Resend only for explicit/legacy Resend bindings, never Gmail fallback.
  return resendMailProvider.send(args);
}
