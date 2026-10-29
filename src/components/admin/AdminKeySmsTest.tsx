import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { sendKeySmsTest } from "@/lib/key-sms-test.functions";
import { buildKeySmsTestText } from "@/lib/key-sms-core";

/** Einzelne Test-SMS mit festem TEST-Text und Dummy-Code; Nummer muss bestätigt werden. */
export function AdminKeySmsTest() {
  const send = useServerFn(sendKeySmsTest);
  const reqId = useRef<string | null>(null);
  const [phone, setPhone] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    reqId.current ??= crypto.randomUUID();
    setBusy(true);
    setMsg(null);
    try {
      const r = await send({ data: { requestId: reqId.current, phone, confirm } });
      setMsg(r.reason);
      reqId.current = null;
      setConfirm(false);
    } catch {
      setMsg("Test konnte nicht ausgeführt werden.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-3 rounded-xl border border-border p-3 text-sm">
      <h2 className="font-bold mb-1">Schlüssel-SMS testen</h2>
      <p className="text-muted-foreground">Sendet genau eine SMS mit diesem festen Text (keine Buchung, kein echter Code):</p>
      <p className="mt-1 rounded bg-muted p-2 text-xs">{buildKeySmsTestText()}</p>
      <input value={phone} onChange={(e) => { setPhone(e.target.value); reqId.current = null; }} placeholder="Handynummer, z. B. 0171…" inputMode="tel"
        className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2" />
      <label className="mt-2 flex items-center gap-2">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        Nummer geprüft – eine echte Test-SMS senden
      </label>
      <button onClick={run} disabled={busy || !confirm || !phone} className="mt-2 min-h-10 rounded-full bg-foreground px-4 font-medium text-background disabled:opacity-40">
        {busy ? "Wird gesendet…" : "Test-SMS senden"}
      </button>
      {msg && <p role="status" className="mt-2 font-medium">{msg}</p>}
    </section>
  );
}
