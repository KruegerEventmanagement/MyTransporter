/**
 * Admin-Versandtest über den bestehenden sendEmail-Pfad. Fester Empfänger,
 * fester Betreff/Text, max. 1 Test pro Minute je Admin, idempotent pro request_id.
 * "accepted" heißt nur: Mailanbieter hat angenommen – nicht zugestellt.
 */
export const MAIL_TEST_TO = "info@mytransporter.org";
export const MAIL_TEST_SUBJECT = "MyTransporter Live-Versandtest";
export const MAIL_TEST_TEXT = "Technischer Versandtest. Keine Buchung und keine Rechnung.";
export const MAIL_TEST_COOLDOWN_MS = 60_000;

export interface MailTestDeps {
  isAdmin: () => Promise<boolean>;
  findByRequest: (requestId: string) => Promise<{ status: string; test_id: string; created_at: string } | null>;
  lastRunAt: (adminId: string) => Promise<string | null>;
  insertRun: (row: { admin_id: string; request_id: string; test_id: string }) => Promise<"ok" | "duplicate">;
  setStatus: (requestId: string, status: "accepted" | "failed") => Promise<void>;
  send: (to: string, subject: string, html: string, idempotencyKey: string) => Promise<boolean>;
  now: () => number;
  randomId: () => string;
}

export type MailTestResult =
  | { ok: true; status: "accepted"; testId: string; sentAtUtc: string; message: string }
  | { ok: false; reason: string; testId?: string };

const ACCEPTED_MSG = "Vom Mailanbieter angenommen. Die Zustellung bitte im Resend-Dashboard prüfen.";

export function mailTestHtml(testId: string, utc: string): string {
  return `<p>${MAIL_TEST_TEXT}</p><p>Test-ID: ${testId}<br/>Zeitpunkt (UTC): ${utc}</p>`;
}

export async function runMailTest(deps: MailTestDeps, adminId: string, requestId: string): Promise<MailTestResult> {
  if (!(await deps.isAdmin())) return { ok: false, reason: "Nicht berechtigt" };
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return { ok: false, reason: "Ungültige Anfrage" };

  const existing = await deps.findByRequest(requestId);
  if (existing) {
    if (existing.status === "accepted") {
      return { ok: true, status: "accepted", testId: existing.test_id, sentAtUtc: existing.created_at, message: ACCEPTED_MSG };
    }
    return { ok: false, reason: existing.status === "failed" ? "Versand fehlgeschlagen." : "Test läuft bereits.", testId: existing.test_id };
  }
  const last = await deps.lastRunAt(adminId);
  if (last && deps.now() - Date.parse(last) < MAIL_TEST_COOLDOWN_MS) {
    return { ok: false, reason: "Bitte warte eine Minute bis zum nächsten Test." };
  }
  const testId = deps.randomId();
  if ((await deps.insertRun({ admin_id: adminId, request_id: requestId, test_id: testId })) === "duplicate") {
    return { ok: false, reason: "Test läuft bereits." };
  }
  const utc = new Date(deps.now()).toISOString();
  let accepted = false;
  try {
    accepted = await deps.send(MAIL_TEST_TO, MAIL_TEST_SUBJECT, mailTestHtml(testId, utc), `mail-test-${requestId}`);
  } catch {
    accepted = false;
  }
  await deps.setStatus(requestId, accepted ? "accepted" : "failed");
  if (!accepted) {
    return { ok: false, testId, reason: "Versand fehlgeschlagen – nicht vom Mailanbieter angenommen. Details stehen ohne Schlüssel in den Admin-Benachrichtigungen." };
  }
  return { ok: true, status: "accepted", testId, sentAtUtc: utc, message: ACCEPTED_MSG };
}
