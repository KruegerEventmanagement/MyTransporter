import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listOpenDepositsFn, getDepositReviewFn, saveDepositDraftFn, previewDepositMailFn, recordManualDepositFn,
  finalizeDepositFn, continueDepositFn, refreshDepositFn, confirmManualPayoutFn,
} from "@/lib/deposit-review.functions";
import { DEDUCTION_DEFS, PHOTO_CHECKLIST, berlinStamp, eur, type DeductionType, type DraftItem } from "@/lib/deposit-review";
import { parseEuroToCents } from "@/lib/money-input";
import { resolveTripPhotoUrl } from "@/lib/trip-photos";

type OpenItem = { source: "booking" | "manual"; id: string; name: string; vehicle: string; endMs: number; state: string; returned: boolean };
type Sel = { checked: boolean; quantity: string; amount: string; reason: string };
const TYPES = Object.keys(DEDUCTION_DEFS) as DeductionType[];
const emptySel = (): Record<DeductionType, Sel> =>
  Object.fromEntries(TYPES.map((t) => [t, { checked: false, quantity: "1", amount: "", reason: "" }])) as Record<DeductionType, Sel>;

function toCents(v: string): number | null {
  try {
    const c = parseEuroToCents(v);
    return typeof c === "number" && Number.isSafeInteger(c) && c >= 0 ? c : null;
  } catch {
    return null;
  }
}

export function DepositsAdmin({ initial }: { initial?: { source: "booking" | "manual"; id: string } | null }) {
  const list = useServerFn(listOpenDepositsFn);
  const [items, setItems] = useState<OpenItem[] | null>(null);
  const [open, setOpen] = useState<{ source: "booking" | "manual"; id: string } | null>(initial ?? null);
  const reload = () => list().then(setItems).catch((e) => toast.error(e instanceof Error ? e.message : "Laden fehlgeschlagen"));
  useEffect(() => { reload(); }, []);

  if (open) return <DepositDetail source={open.source} id={open.id} onBack={() => { setOpen(null); reload(); }} />;
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Offene Kautionen</h2>
      <p className="text-xs text-muted-foreground">Nach Rückgabe oder geplantem Mietende. Speichern eines Entwurfs bewegt kein Geld und sendet keine Mail.</p>
      {!items ? <p className="text-sm text-muted-foreground">Lädt …</p> : items.length === 0 ? <p className="text-sm">Keine offenen Kautionen.</p> : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={`${i.source}:${i.id}`}>
              <button onClick={() => setOpen({ source: i.source, id: i.id })} className="w-full text-left rounded-2xl border border-border bg-card p-3">
                <div className="flex justify-between gap-2"><strong className="text-sm">{i.name}</strong><span className="text-xs rounded-full bg-secondary px-2 py-0.5">{i.state}</span></div>
                <p className="text-xs text-muted-foreground mt-1">{i.vehicle} · Ende {berlinStamp(i.endMs)} · {i.source === "manual" ? "Manueller Termin" : i.returned ? "Rückgabe gemeldet" : "Rückgabe nicht bestätigt"}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DepositDetail({ source, id, onBack }: { source: "booking" | "manual"; id: string; onBack: () => void }) {
  const get = useServerFn(getDepositReviewFn);
  const save = useServerFn(saveDepositDraftFn);
  const preview = useServerFn(previewDepositMailFn);
  const recordDeposit = useServerFn(recordManualDepositFn);
  const finalize = useServerFn(finalizeDepositFn);
  const cont = useServerFn(continueDepositFn);
  const refresh = useServerFn(refreshDepositFn);
  const confirmPayout = useServerFn(confirmManualPayoutFn);
  const [ctx, setCtx] = useState<any>(null);
  const [sel, setSel] = useState(emptySel());
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [mail, setMail] = useState<{ html: string; subject: string; to: string | null } | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [depAmount, setDepAmount] = useState("");
  const [depMethod, setDepMethod] = useState("cash");
  const [payMethod, setPayMethod] = useState("cash");

  const load = async () => {
    const c = await get({ data: { source, id } });
    setCtx(c);
    const s = emptySel();
    for (const it of (c.review?.items ?? []) as DraftItem[]) {
      s[it.type] = { checked: true, quantity: String(it.quantity ?? 1), amount: it.amount_cents != null ? (it.amount_cents / 100).toFixed(2).replace(".", ",") : "", reason: it.reason ?? "" };
    }
    setSel(s);
    setMsg(c.review?.customer_message ?? "");
    const urls: Record<string, string> = {};
    await Promise.all((c.photos ?? []).filter((p: any) => p.photo_type.startsWith("post_") || p.photo_type === "tank_receipt").map(async (p: any) => { urls[p.photo_url] = await resolveTripPhotoUrl(p.photo_url); }));
    setPhotoUrls(urls);
  };
  useEffect(() => { load().catch((e) => toast.error(e instanceof Error ? e.message : "Laden fehlgeschlagen")); }, [source, id]);

  const draftItems = useMemo((): { items: DraftItem[]; error: string | null } => {
    const out: DraftItem[] = [];
    for (const t of TYPES) {
      const s = sel[t];
      if (!s.checked) continue;
      const def = DEDUCTION_DEFS[t];
      const it: DraftItem = { type: t, reason: s.reason.trim() || undefined };
      if (def.mode === "per_unit") it.quantity = Number.parseInt(s.quantity, 10);
      if (def.mode === "free" || def.mode === "amount_plus_fee") {
        const c = toCents(s.amount);
        if (c == null || c === 0) return { items: [], error: `${def.label}: Betrag eingeben` };
        it.amount_cents = c;
      }
      out.push(it);
    }
    return { items: out, error: null };
  }, [sel]);

  if (!ctx) return <p className="text-sm text-muted-foreground">Lädt …</p>;
  const finalized = ctx.review?.status === "finalized";
  const dep: number | null = ctx.depositCents;
  const lineOf = (t: DeductionType): number => {
    const def = DEDUCTION_DEFS[t]; const s = sel[t];
    if (def.mode === "fixed") return def.unitCents!;
    if (def.mode === "per_unit") return def.unitCents! * (Number.parseInt(s.quantity, 10) || 0);
    if (def.mode === "amount_plus_fee") return (toCents(s.amount) ?? 0) + def.feeCents!;
    if (def.mode === "snapshot") return ctx.extraKm.cents ?? 0;
    return toCents(s.amount) ?? 0;
  };
  const total = TYPES.filter((t) => sel[t].checked).reduce((s, t) => s + lineOf(t), 0);
  const applied = dep == null ? 0 : Math.min(total, dep);
  const refund = dep == null ? 0 : dep - applied;
  const outstanding = total - applied;

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); } catch (e) { toast.error(e instanceof Error ? e.message : "Fehlgeschlagen"); } finally { setBusy(false); }
  };
  const doSave = () => run(async () => {
    if (draftItems.error) throw new Error(draftItems.error);
    await save({ data: { source, id, revision: ctx.review?.revision ?? null, items: draftItems.items, message: msg } });
    await load();
  }, "Entwurf gespeichert (kein Geld bewegt, keine Mail)");
  const doPreview = () => run(async () => {
    if (draftItems.error) throw new Error(draftItems.error);
    const p = await preview({ data: { source, id, items: draftItems.items, message: msg } });
    setMail({ html: p.html, subject: p.subject, to: p.to });
  });
  const setT = (t: DeductionType, patch: Partial<Sel>) => setSel((s) => ({ ...s, [t]: { ...s[t], ...patch } }));
  const settlement = ctx.settlements?.find((s: any) => s.id === ctx.review?.settlement_id);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm underline">← Offene Kautionen</button>
      <div className="rounded-2xl border border-border bg-card p-4 space-y-1 text-sm">
        <h2 className="text-lg font-semibold">{ctx.customerName}</h2>
        <p>{ctx.bookingRef} · {ctx.vehicle}</p>
        <p>Beginn {berlinStamp(ctx.startMs)} · Ende {berlinStamp(ctx.endMs)}</p>
        <p>Rückgabe: {ctx.returnReportedMs ? `gemeldet ${berlinStamp(ctx.returnReportedMs)}` : "noch nicht bestätigt"}</p>
        <p>Miete: {ctx.priceLine}</p>
        <p>Kaution: <strong>{ctx.depositLine}</strong></p>
        {ctx.knownBounce && <p className="font-semibold">Achtung: E-Mail-Adresse dauerhaft unzustellbar, keine Kundenmail.</p>}
        {!ctx.email && <p className="font-semibold">Keine E-Mail-Adresse hinterlegt: keine Kundenmail.</p>}
      </div>

      {ctx.checklist && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold">Rückgabe-Checkliste</h3>
          <ul className="grid grid-cols-2 gap-1 text-sm">
            {PHOTO_CHECKLIST.map((p) => { const c = ctx.checklist.find((x: any) => x.tag === p.tag); return <li key={p.tag}>{c?.present ? "✓" : "✗"} {p.label}</li>; })}
          </ul>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {ctx.photos.filter((p: any) => photoUrls[p.photo_url]).map((p: any) => (
              <a key={p.photo_url} href={photoUrls[p.photo_url]} target="_blank" rel="noreferrer" className="block">
                <img src={photoUrls[p.photo_url]} alt={p.photo_type} className="aspect-square w-full object-cover rounded-lg border border-border" loading="lazy" />
                <span className="text-[10px] text-muted-foreground">{p.photo_type}</span>
              </a>
            ))}
          </div>
        </div>
      )}
      {ctx.issues.length > 0 && (
        <div className="rounded-2xl bg-secondary p-3 text-xs space-y-1">{ctx.issues.map((i: string) => <p key={i}>• {i}</p>)}</div>
      )}

      {source === "manual" && !finalized && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold">Tatsächlich erhaltene Kaution</h3>
          <p className="text-xs text-muted-foreground">Aktuell: {ctx.depositLine}. Nur echte Beträge eintragen.</p>
          <div className="flex gap-2">
            <input value={depAmount} onChange={(e) => setDepAmount(e.target.value)} placeholder="z. B. 200,00" inputMode="decimal" className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <select value={depMethod} onChange={(e) => setDepMethod(e.target.value)} className="rounded-lg border border-border bg-background px-2 text-sm">
              <option value="cash">Bar</option><option value="transfer">Überweisung</option><option value="sumup">SumUp</option><option value="other">Sonstiges</option><option value="none">Keine Kaution</option>
            </select>
          </div>
          <button disabled={busy} onClick={() => run(async () => { const c = toCents(depAmount || "0"); if (c == null) throw new Error("Betrag ungültig"); await recordDeposit({ data: { source, id, cents: c, method: depMethod } }); await load(); }, "Kaution erfasst")} className="rounded-full border border-border px-4 py-2 text-xs font-semibold">Kaution speichern</button>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">Abzugspositionen {finalized && "(abgeschlossen)"}</h3>
        {TYPES.map((t) => {
          const def = DEDUCTION_DEFS[t]; const s = sel[t];
          const disabled = finalized || (t === "extra_km" && (!ctx.extraKm.cents || ctx.extraKm.alreadyPaid)) || (t === "documentation_fee" && !ctx.docFee.allowed && !s.checked);
          return (
            <div key={t} className="rounded-xl bg-secondary p-3 space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={s.checked} disabled={disabled} onChange={(e) => setT(t, { checked: e.target.checked })} className="mt-1" />
                <span className="flex-1"><strong>{def.label}</strong>{s.checked && <span className="float-right">{eur(lineOf(t))}</span>}
                  <span className="block text-xs text-muted-foreground">{def.source}{t === "documentation_fee" ? ` · ${ctx.docFee.why}` : ""}{t === "extra_km" ? ` · ${ctx.extraKm.cents ? `${eur(ctx.extraKm.cents)}${ctx.extraKm.alreadyPaid ? " bereits bezahlt" : ""}` : "keine Forderung"}` : ""}</span>
                </span>
              </label>
              {s.checked && !finalized && (
                <div className="grid gap-2">
                  {def.mode === "per_unit" && <input value={s.quantity} onChange={(e) => setT(t, { quantity: e.target.value })} inputMode="numeric" placeholder={def.unitLabel} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />}
                  {(def.mode === "free" || def.mode === "amount_plus_fee") && <input value={s.amount} onChange={(e) => setT(t, { amount: e.target.value })} inputMode="decimal" placeholder={def.mode === "amount_plus_fee" ? "Tatsächliche Tankkosten in €" : "Betrag in €"} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />}
                  <input value={s.reason} onChange={(e) => setT(t, { reason: e.target.value })} placeholder={def.reasonRequired ? "Begründung (Pflicht, für Kunden sichtbar)" : "Begründung (optional, für Kunden sichtbar)"} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
              )}
            </div>
          );
        })}
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} disabled={finalized} placeholder="Zusätzliche Nachricht an den Kunden (optional)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" rows={3} />
        <div className="text-sm space-y-1">
          <div className="flex justify-between"><span>Kaution</span><strong>{dep == null ? "nicht erfasst" : eur(dep)}</strong></div>
          <div className="flex justify-between"><span>Abzug gesamt</span><strong>{eur(finalized ? ctx.review.final_deduct_total_cents : total)}</strong></div>
          <div className="flex justify-between"><span>Rückzahlung</span><strong>{eur(finalized ? ctx.review.final_refund_cents : refund)}</strong></div>
          {(finalized ? ctx.review.final_outstanding_cents : outstanding) > 0 && <div className="flex justify-between"><span>Offene Restforderung (keine automatische Abbuchung)</span><strong>{eur(finalized ? ctx.review.final_outstanding_cents : outstanding)}</strong></div>}
        </div>
        {!finalized && (
          <div className="grid grid-cols-2 gap-2">
            <button disabled={busy} onClick={doSave} className="rounded-full border border-border py-2 text-sm font-semibold">Entwurf speichern</button>
            <button disabled={busy || dep == null} onClick={doPreview} className="rounded-full border border-border py-2 text-sm font-semibold">Mailvorschau</button>
          </div>
        )}
      </div>

      {mail && (
        <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
          <p className="text-xs">Vorschau an {mail.to ?? "keine Adresse"} · {mail.subject}</p>
          <iframe title="Mailvorschau" srcDoc={mail.html} sandbox="" className="w-full h-[480px] rounded-lg border border-border bg-background" />
        </div>
      )}

      {!finalized && ctx.review && dep != null && (
        <div className="rounded-2xl border-2 border-foreground p-4 space-y-2">
          <h3 className="text-sm font-semibold">Kaution abschließen</h3>
          <p className="text-sm">Abschluss für <strong>{ctx.customerName}</strong> mit Rückzahlung <strong>{eur(refund)}</strong>{source === "booking" ? " auf die Originalzahlung (nur Kautionsanteil)" : " (manuell, separate Bestätigung)"}. Gilt für den zuletzt gespeicherten Entwurf.</p>
          <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={`Zur Bestätigung Namen eintippen: ${ctx.customerName}`} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <button disabled={busy || confirmName.trim() !== ctx.customerName.trim()} onClick={() => run(async () => { setCtx(await finalize({ data: { source, id, revision: ctx.review.revision, confirmName, confirmRefundCents: refund } })); }, "Abschluss gespeichert")} className="w-full rounded-full bg-foreground text-background py-2.5 text-sm font-semibold disabled:opacity-50">
            {eur(refund)} an {ctx.customerName} zurückzahlen und abschließen
          </button>
        </div>
      )}

      {finalized && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2 text-sm">
          <h3 className="font-semibold">Status</h3>
          {source === "booking" ? (
            <p>Stripe: {settlement ? `${settlement.status}${settlement.failure_reason ? ` · ${settlement.failure_reason}` : ""}` : "Auftrag noch nicht angelegt"}</p>
          ) : (
            <p>Manuelle Rückzahlung: {ctx.review.manual_payout_status === "confirmed" ? `bestätigt (${ctx.review.manual_payout_method})` : ctx.review.manual_payout_status === "open" ? "offen" : "nicht erforderlich"}</p>
          )}
          <p>Kundenmail: {ctx.closingMail ? `${ctx.closingMail.status}${ctx.closingMail.blocked_reason ? ` · ${ctx.closingMail.blocked_reason}` : ""}` : "noch nicht erstellt (erst bei bestätigtem oder beauftragtem Zahlungsstand)"}</p>
          <div className="flex flex-wrap gap-2">
            {source === "booking" && !settlement && <button disabled={busy} onClick={() => run(async () => setCtx(await cont({ data: { source, id } })), "Fortgesetzt")} className="rounded-full border border-border px-4 py-2 text-xs font-semibold">Rückzahlung fortsetzen (gleicher Auftrag)</button>}
            {source === "booking" && settlement?.status === "processing" && <button disabled={busy} onClick={() => run(async () => setCtx(await cont({ data: { source, id } })), "Erneut versucht")} className="rounded-full border border-border px-4 py-2 text-xs font-semibold">Erneut versuchen (gleicher Key)</button>}
            <button disabled={busy} onClick={() => run(async () => setCtx(await refresh({ data: { source, id } })), "Status abgeglichen")} className="rounded-full border border-border px-4 py-2 text-xs font-semibold">Status abgleichen</button>
          </div>
          {source === "manual" && ctx.review.manual_payout_status === "open" && (
            <div className="flex gap-2 pt-2">
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="rounded-lg border border-border bg-background px-2 text-sm">
                <option value="cash">Bar</option><option value="transfer">Überweisung</option><option value="sumup">SumUp</option><option value="other">Sonstiges</option>
              </select>
              <button disabled={busy} onClick={() => run(async () => setCtx(await confirmPayout({ data: { source, id, method: payMethod, confirmRefundCents: ctx.review.final_refund_cents } })), "Rückzahlung bestätigt")} className="flex-1 rounded-full bg-foreground text-background py-2 text-xs font-semibold">{eur(ctx.review.final_refund_cents)} an {ctx.customerName} ausgezahlt bestätigen</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
