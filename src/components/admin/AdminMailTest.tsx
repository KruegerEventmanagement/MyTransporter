import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { sendAdminMailTest } from "@/lib/mail-test.functions";

/** Button „E-Mail-Versand testen“ – fester Empfänger info@mytransporter.org. */
export function AdminMailTest() {
  const send = useServerFn(sendAdminMailTest);
  const reqId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    reqId.current ??= crypto.randomUUID();
    setBusy(true);
    setMsg(null);
    try {
      const r = await send({ data: { requestId: reqId.current } });
      setMsg(r.ok ? `${r.message} Test-ID ${r.testId}, ${r.sentAtUtc} UTC.` : `${r.reason}${r.testId ? ` (Test-ID ${r.testId})` : ""}`);
      reqId.current = null;
    } catch {
      setMsg("Test konnte nicht ausgeführt werden.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-border p-3 text-sm">
      <h2 className="font-bold mb-1">E-Mail-Versand testen</h2>
      <p className="text-muted-foreground">Sendet eine technische Test-Mail an info@mytransporter.org. Keine Buchung, keine Rechnung.</p>
      <button onClick={run} disabled={busy} className="mt-2 min-h-10 rounded-full bg-foreground px-4 font-medium text-background disabled:opacity-40">
        {busy ? "Wird gesendet…" : "E-Mail-Versand testen"}
      </button>
      {msg && <p role="status" className="mt-2 font-medium">{msg}</p>}
    </section>
  );
}
