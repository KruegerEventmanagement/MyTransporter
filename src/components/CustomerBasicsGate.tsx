import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCustomerBasics, saveCustomerBasics } from "@/lib/customer-basics.functions";
import { BASICS_LABELS, checkCustomerBasics, type BasicsField } from "@/lib/customer-basics";

type Props = { userId: string | null; onChange: (complete: boolean) => void };
const EDITABLE: BasicsField[] = ["first_name", "last_name", "birth_date", "phone"];

/** Bestandskunden: fehlende Pflichtangaben vor der Zahlung ergänzen (kein stilles Blockieren). */
export function CustomerBasicsGate({ userId, onChange }: Props) {
  const load = useServerFn(getCustomerBasics);
  const save = useServerFn(saveCustomerBasics);
  const [state, setState] = useState<"loading" | "ok" | "edit" | "error">("loading");
  const [missing, setMissing] = useState<BasicsField[]>([]);
  const [form, setForm] = useState({ first_name: "", last_name: "", birth_date: "", phone: "" });
  const [problems, setProblems] = useState<Partial<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setState("loading");
    onChange(false);
    try {
      const r = await load();
      if (r.loadError || !r.values) { setState("error"); return; }
      if (r.ok) { setState("ok"); onChange(true); return; }
      setMissing(r.missing);
      setForm({ first_name: r.values.first_name, last_name: r.values.last_name, birth_date: r.values.birth_date, phone: r.values.phone });
      setState("edit");
    } catch {
      setState("error");
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (userId) void refresh(); }, [userId]);

  if (!userId || state === "ok") return null;
  if (state === "loading") return <p className="mt-6 text-sm text-muted-foreground">Kundendaten werden geprüft…</p>;
  if (state === "error")
    return (
      <div role="alert" className="mt-6 rounded-2xl border border-border p-4 text-sm">
        Deine Kundendaten konnten nicht geprüft werden.{" "}
        <button className="underline font-medium" onClick={() => void refresh()}>Erneut versuchen</button>
      </div>
    );

  const submit = async () => {
    const local = checkCustomerBasics({ ...form, email: "x@x.de" });
    const lp = { ...local.problems }; delete lp.email;
    if (Object.keys(lp).length) { setProblems(lp); return; }
    setBusy(true);
    try {
      const r = await save({ data: form });
      if (r.ok) { setProblems({}); await refresh(); } else setProblems(r.problems);
    } catch {
      setProblems({ phone: "Speichern fehlgeschlagen. Bitte erneut versuchen." });
    } finally {
      setBusy(false);
    }
  };

  const fields = EDITABLE.filter((f) => missing.includes(f) || problems[f]);
  return (
    <div className="mt-6 rounded-2xl border-2 border-foreground p-4 text-left">
      <p className="font-bold">Bitte ergänze deine Pflichtangaben</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Damit wir dich vor der Abholung erreichen und dir den Schlüsselcode per SMS schicken können, brauchen wir noch:{" "}
        {missing.map((f) => BASICS_LABELS[f]).join(", ")}.
      </p>
      {missing.includes("email") && (
        <p className="mt-2 text-sm font-medium" role="alert">Deine E-Mail-Adresse fehlt im Konto. Bitte melde dich bei uns: info@mytransporter.org</p>
      )}
      <div className="mt-3 grid gap-3">
        {fields.map((f) => (
          <label key={f} className="text-sm font-medium">
            {BASICS_LABELS[f]}
            <input
              type={f === "birth_date" ? "date" : f === "phone" ? "tel" : "text"}
              inputMode={f === "phone" ? "tel" : undefined}
              autoComplete={f === "phone" ? "tel" : f === "birth_date" ? "bday" : f === "first_name" ? "given-name" : "family-name"}
              placeholder={f === "phone" ? "z. B. 0171 2345678 oder +357 99 123456" : undefined}
              value={form[f as keyof typeof form]}
              onChange={(e) => setForm({ ...form, [f]: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-normal"
            />
            {problems[f] && <span role="alert" className="mt-1 block text-xs font-medium">{problems[f]}</span>}
          </label>
        ))}
      </div>
      <button onClick={() => void submit()} disabled={busy}
        className="mt-3 min-h-10 rounded-full bg-foreground px-5 font-medium text-background disabled:opacity-40">
        {busy ? "Wird gespeichert…" : "Angaben speichern"}
      </button>
    </div>
  );
}
