/** 5-Minuten-Job: Versand-Sweep und Bounce-Scan laufen getrennt; ein Fehler stoppt den anderen nie. */
export type CustomerMailsJobDeps = {
  sweep: () => Promise<Record<string, unknown>>;
  scan: () => Promise<unknown>;
  log?: (msg: string, detail: string) => void;
};

export async function runCustomerMailsJob(deps: CustomerMailsJobDeps): Promise<{ status: number; body: Record<string, unknown> }> {
  const log = deps.log ?? ((m, d) => console.error(m, d));
  const msg = (e: unknown, n: number) => String((e as Error)?.message ?? e).slice(0, n);
  let stats: Record<string, unknown> | null = null;
  let sweepFailed = false;
  try {
    stats = await deps.sweep();
  } catch (e) {
    sweepFailed = true;
    log("process-customer-mails failed", msg(e, 300));
  }
  let bounces: unknown = null;
  try {
    bounces = await deps.scan();
  } catch (e) {
    log("bounce scan failed", msg(e, 200));
    bounces = { error: true };
  }
  if (sweepFailed) return { status: 500, body: { ok: false, sweep: { error: true }, bounces } };
  return { status: 200, body: { ok: true, ...stats, bounces } };
}
