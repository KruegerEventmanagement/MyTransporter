import { describe, expect, it, vi } from 'vitest';
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from } }));
vi.mock('@/lib/booking-emails.server', () => ({ sendEmail: vi.fn() }));
import { processBirthdayEmails } from './birthday.server';
describe('no birthday promotion in app mails', () => {
  it('does not read DOB, create coupons, send or backfill campaigns', async () => {
    expect(await processBirthdayEmails(new Date('2026-10-17T10:00:00Z'))).toMatchObject({ candidates: 0, sent: 0, failed: 0 });
    expect(from).not.toHaveBeenCalled();
  });
});
