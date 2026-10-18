/** Offline preparation only. No provider, server, DB, outbox or send imports. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderEmail, noteBlock, esc, COMPANY_ADDRESS } from '../../src/lib/email-template';

const dir = fileURLToPath(new URL('.', import.meta.url));
const rows = readFileSync(`${dir}recipients.csv`, 'utf8').trim().split('\n').slice(1).map(line => {
  const [name, email, source, sourceIds, category, decision, note] = line.split(',');
  return { name, email, source, sourceIds, category, decision, note };
});
const reviewUrl = 'https://www.google.com/maps?cid=9407266905378611223';
// Functional direct-email unsubscribe; no fabricated outbox-backed HTTP token.
const unsubscribe = 'mailto:info@mytransporter.org?subject=Keine%20Bewertungsanfragen%20mehr&body=Bitte%20sende%20mir%20keine%20weiteren%20Bewertungsanfragen.';
const subject = 'Danke für deine Buchung! Wie war deine Erfahrung?';
mkdirSync(`${dir}drafts`, { recursive: true });
const manifest = [];
for (const r of rows.filter(r => ['prepared', 'separate_contact', 'identity_review'].includes(r.decision))) {
  const firstName = r.name.split(' ')[0];
  const intro = [
    'vielen Dank, dass du dich für MyTransporter entschieden hast!',
    'Wenn du kurz Zeit hast, freuen wir uns über deine ehrliche Bewertung auf Google. Wie war deine bisherige Erfahrung mit uns? Deine Rückmeldung hilft uns, unseren Service weiter zu verbessern und anderen Kunden bei ihrer Entscheidung.',
    'Deine Bewertung ist freiwillig. Uns interessiert deine ehrliche Erfahrung mit unserer Buchung und unserem Service.',
  ];
  const closing = r.category === 'future' || r.category === 'cancelled'
    ? 'Wir freuen uns, dich bald bei MyTransporter begrüßen zu dürfen!'
    : 'Wir freuen uns, dich bald wieder bei MyTransporter begrüßen zu dürfen!';
  const outro = [
    'Vielen Dank für deine Unterstützung. Wir wünschen dir einen schönen Abend und einen guten Start in die neue Woche.',
    closing,
  ];
  const html = renderEmail({ firstName, heading: 'Wie war deine Erfahrung?', intro,
    button: { label: 'Jetzt auf Google bewerten', url: reviewUrl },
    outro, signature: 'Christian Krüger\nMyTransporter',
    extraHtml: noteBlock(`Du möchtest keine Bewertungsanfragen mehr erhalten? <a href="${esc(unsubscribe)}" style="color:#000;">Hier abmelden</a>. Du kannst auch einfach auf diese E-Mail antworten. Wir berücksichtigen deinen Widerspruch vor jeder weiteren Bewertungsanfrage.`),
  });
  const text = [`Hallo ${firstName},`, '', ...intro, '', `Jetzt auf Google bewerten: ${reviewUrl}`, '', ...outro, '', 'Herzliche Grüße', 'Christian Krüger', 'MyTransporter', '', 'Keine Bewertungsanfragen mehr: Antworte bitte mit "Keine Bewertungsanfragen mehr" oder schreibe an info@mytransporter.org.', unsubscribe, '', COMPANY_ADDRESS].join('\n\n');
  const file = r.email.replace(/[^a-z0-9]/gi, '_');
  writeFileSync(`${dir}drafts/${file}.html`, html);
  writeFileSync(`${dir}drafts/${file}.txt`, text);
  manifest.push({ to: r.email, name: r.name, subject, from: 'Christian Krüger – MyTransporter <info@mytransporter.org>', reply_to: 'info@mytransporter.org', decision: r.decision, category: r.category, htmlFile: `drafts/${file}.html`, textFile: `drafts/${file}.txt`, headers: { 'List-Unsubscribe': `<${unsubscribe}>` }, sendEnabled: false });
}
writeFileSync(`${dir}draft-manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`Prepared ${manifest.length} local draft pairs. No sends, tokens, outbox rows or network calls.`);