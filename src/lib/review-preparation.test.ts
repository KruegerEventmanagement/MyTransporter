import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const csv = readFileSync(new URL('../../docs/review-preparation-2026-10-18/recipients.csv', import.meta.url), 'utf8').trim().split('\n').slice(1);
const rows = csv.map(line => {
  const [name, email, source, sourceIds, category, decision] = line.split(',');
  return { name, email, source, sourceIds, category, decision };
});
const prepared = rows.filter(r => r.decision === 'prepared');
describe('Authorized review preparation exclusions', () => {
  it('excludes Rainer by the exact owner-resolved address', () => {
    expect(rows.find(r => r.email === 'rainerrene11@web.de')?.decision).toBe('owner_exclusion');
    expect(prepared.some(r => r.email === 'rainerrene11@web.de')).toBe(false);
  });
  it('does not repeat Fatih', () => {
    expect(rows.find(r => r.email === 'fatih.cirak61@googlemail.com')?.decision).toBe('already_sent');
  });
  it('uses only the verified Daniel address for his source', () => {
    expect(rows.filter(r => r.sourceIds === 'bb8776b4-38ff-4a0e-9c47-6f140e1762bb').map(r => r.email)).toEqual(['daniel.o.konrad@gmail.com']);
  });
  it('keeps Tanja separate without changing cancelled eligibility', () => {
    expect(rows.find(r => r.email === 't.zara@gmx.de')?.decision).toBe('separate_contact');
  });
  it('deduplicates repeated Michael bookings to one person', () => {
    expect(prepared.filter(r => r.email === 'mi-nagy@t-online.de')).toHaveLength(1);
    expect(prepared.find(r => r.email === 'mi-nagy@t-online.de')?.sourceIds.split('|')).toHaveLength(2);
  });
  it('does not invent addresses for the five missing manual contacts', () => {
    const missing = rows.filter(r => r.decision === 'missing_email');
    expect(missing.map(r => r.name).sort()).toEqual(['Sandra Wünsche', 'Suzan Ay', 'Ali Kocaaslan', 'Tobias Unkler', 'Simon Leifels'].sort());
    expect(missing.every(r => r.email === '')).toBe(true);
  });
});