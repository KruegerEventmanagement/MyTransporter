import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listOpenDepositsFn, getDepositReviewFn, saveDepositDraftFn, previewDepositMailFn, recordManualDepositFn,
  finalizeDepositFn, continueDepositFn, refreshDepositFn, confirmManualPayoutFn,
} from "@/lib/deposit-review.functions";
import { getCalendarEntryDetails, type CalendarEntryDetails } from "@/lib/calendar-details.functions";
import { DEDUCTION_DEFS, PHOTO_CHECKLIST, SETTLEMENT_STATE_DE, MAIL_STATE_DE, berlinStamp, draftKey, eur, type DeductionType, type DraftItem } from "@/lib/deposit-review";
import { parseEuroToCents } from "@/lib/money-input";
import { resolveTripPhotoUrl } from "@/lib/trip-photos";

type OpenItem = { source: "booking" | "manual"; id: string; name: string; vehicle: string; endMs: number; state: string; returned: boolean };
type Sel = { checked: boolean; quantity: string; amount: string; reason: string };
const TYPES = Object.keys(DEDUCTION_DEFS) as DeductionType[];
const emptySel = (): Record<DeductionType, Sel> =>
  Object.fromEntries(TYPES.map((t) => [t, { checked: false, quantity: "1", amount: "", reason: "" }])) as Record<DeductionType, Sel>;

function toCents(v: string): number | null {
  const r = parseEuroToCents(v);
  return r.ok && r.cents >= 0 ? r.cents : null;
}
const toEuro = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/** Verständliche deutsche Bezeichnungen für alle Fahrtfotos (Übergabe + Rückgabe). */
function photoLabel(tag: string): string {
  const post = PHOTO_CHECKLIST.find((p) => p.tag === tag);
  if (post) return `Rückgabe: ${post.label}`;
  if (tag === "post_odometer") return "Rückgabe: Tacho";
  if (tag.startsWith("pre_")) {
    const base = PHOTO_CHECKLIST.find((p) => p.tag === `post_${tag.slice(4)}`);
    return `Übergabe: ${base?.label ?? tag.slice(4)}`;
  }
  return tag;
}

export function DepositsAdmin({ initial }: { initial?: { source: "booking" | "manual"; id: string } | null }) {
  const list = useServerFn(listOpenDepositsFn);
  const [items, setItems] = useState<OpenItem[] | null>(null);
  const [open, setOpen] = useState<{ source: "booking" | "manual"; id: string } | null>(initial ?? null);
  const reload = () => list().then(setItems).catch((e) => toast.error(e instanceof Error ? e.message : "Laden fehlgeschlagen"));
  useEffect(() => { reload(); }, []);
  // Deep-Link-Wechsel (z. B. Push-Klick bei bereits geöffnetem Admin) öffnet die neue
  // Kautionsansicht; Wechsel auf die Liste/Browser-Zurück schließt die Detailauswahl.
  useEffect(() => { setOpen(initial ?? null); }, [initial?.source, initial?.id]);

  const backToList = () => {
    window.history.pushState(null, "", "/admin?kaution=list");
    setOpen(null);
    // pushState feuert selbst kein popstate: ohne dieses Ereignis bliebe der
    // Elterncache (depositDeepLink) auf der alten Buchung stehen.
    window.dispatchEvent(new PopStateEvent("popstate"));
    reload();
  };

  if (open) return <DepositDetail key={`${open.source}:${open.id}`} source={open.source} id={open.id} onBack={backToList} />;
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

/**
 * Lader: holt Kontext, Fotos und Dokumente. Stale-Request-Fencing über seq:
 * eine verspätete Antwort von Kunde A übermalt niemals Kunde B.
 * Der Editor wird je Quelle/Revision/Status neu gemountet (key), dadurch
 * bleiben keine Hook- oder Zustandsreste des vorigen Kunden hängen.
 */
function DepositDetail({ source, id, onBack }: { source: "booking" | "manual"; id: string; onBack: () => void }) {
  const get = useServerFn(getDepositReviewFn);
  const getDetails = useServerFn(getCalendarEntryDetails);
  const [ctx, setCtx] = useState<any>(null);
  const [details, setDetails] = useState<CalendarEntryDetails | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const seq = useRef(0);

  const load = async () => {
    const my = ++seq.current;
    const c = await get({ data: { source, id } });
    const urls: Record<string, string> = {};
    await Promise.all((c.photos ?? []).map(async (p: any) => { urls[p.photo_url] = await resolveTripPhotoUrl(p.photo_url); }));
    const det = await getDetails({ data: { kind: source, id } }).catch(() => null);
    if (my !== seq.current) return; // veraltete Antwort verwerfen
    setPhotoUrls(urls);
    setDetails(det);
    setCtx(c);
  };
  useEffect(() => {
    setCtx(null);
    setDetails(null);
    setPhotoUrls({});
    load().catch((e) => toast.error(e instanceof Error ? e.message : "Laden fehlgeschlagen"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, id]);

  if (!ctx) return <p className="text-sm text-muted-foreground">Lädt …</p>;
  return (
    <DepositEditor
      key={`${source}:${id}:${ctx.review?.revision ?? 0}:${ctx.review?.status ?? "none"}`}
      source={source}
      id={id}
      ctx={ctx}
      details={details}
      photoUrls={photoUrls}
      onBack={onBack}
      onReload={load}
      onCtx={setCtx}
    />
  );
}

function DepositEditor({ source, id, ctx, details, photoUrls, onBack, onReload, onCtx }: {
  source: "booking" | "manual"; id: string; ctx: any; details: CalendarEntryDetails | null;
  photoUrls: Record<string, string>; onBack: () => void; onReload: () => Promise<void>; onCtx: (c: any) => void;
}) {
  const save = useServerFn(saveDepositDraftFn);
  const preview = useServerFn(previewDepositMailFn);
  const recordDeposit = useServerFn(recordManualDepositFn);
  const finalize = useServerFn(finalizeDepositFn);
  const cont = useServerFn(continueDepositFn);
  const refresh = useServerFn(refreshDepositFn);
  const confirmPayout = useServerFn(confirmManualPayoutFn);
  const [sel, setSel] = useState(() => {
    const s = emptySel();
    for (const it of (ctx.review?.items ?? []) as DraftItem[]) {
      s[it.type] = { checked: true, quantity: String(it.quantity ?? 1), amount: it.amount_cents != null ? toEuro(it.amount_cents) : "", reason: it.reason ?? "" };
    }
    return s;
  });
  const [msg, setMsg] = useState(ctx.review?.customer_message ?? "");
  const [busy, setBusy] = useState(false);
  const [mail, setMail] = useState<{ html: string; subject: string; to: string | null } | null>(null);
  const [depAmount, setDepAmount] = useState("");
  const [depMethod, setDepMethod] = useState("cash");
  const [payMethod, setPayMethod] = useState("cash");
  // Gespeicherter Override bleibt nach Speichern/Neuladen sichtbar und wirksam.
  const [savedOverride] = useState<number | null>(ctx.review?.refund_override_cents ?? null);
  const [refundInput, setRefundInput] = useState(ctx.review?.refund_override_cents != null ? toEuro(ctx.review.refund_override_cents) : "");
  const [refundTouched, setRefundTouched] = useState(false);
  const [adjustReason, setAdjustReason] = useState(ctx.review?.adjustment_reason ?? "");
  const [sendMail, setSendMail] = useState(ctx.review?.send_closing_mail === true);
  const [savedKey, setSavedKey] = useState<string | null>(ctx.review ? draftKey((ctx.review.items ?? []) as DraftItem[], ctx.review.customer_message, {
    refundCents: ctx.review.refund_override_cents ?? null,
    reason: ctx.review.adjustment_reason ?? null,
    sendMail: ctx.review.send_closing_mail === true,
  }) : null);

  const draftItems = useMemo((): { items: DraftItem[]; error: string | null } => {
    const out: DraftItem[] = [];
    for (const t of TYPES) {
      const s = sel[t];
      if (!s.checked) continue;
      const def = DEDUCTION_DEFS[t];
      const it: DraftItem = { type: t, reason: s.reason.trim() || undefined };
      if (t === "extra_km" && !ctx.extraKm.cents) it.quantity = Number.parseInt(s.quantity, 10);
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

  const finalized = ctx.review?.status === "finalized";
  const dep: number | null = ctx.depositCents;
  const lineOf = (t: DeductionType): number => {
    const def = DEDUCTION_DEFS[t]; const s = sel[t];
    if (def.mode === "fixed") return def.unitCents!;
    if (def.mode === "per_unit") return def.unitCents! * (Number.parseInt(s.quantity, 10) || 0);
    if (def.mode === "amount_plus_fee") return (toCents(s.amount) ?? 0) + def.feeCents!;
    if (def.mode === "snapshot") return ctx.extraKm.cents ?? (ctx.extraKm.rateCents ?? 0) * (Number.parseInt(s.quantity, 10) || 0);
    return toCents(s.amount) ?? 0;
  };
  const total = TYPES.filter((t) => sel[t].checked).reduce((s, t) => s + lineOf(t), 0);
  const suggestedRefund = dep == null ? 0 : Math.max(0, dep - Math.min(total, dep));
  const outstanding = Math.max(0, total - (dep ?? 0));

  // Frei bestätigter Rückzahlungsbetrag: Vorschlag = Kaution minus Abzüge, editierbar.
  // Ein gespeicherter Override gilt auch ohne erneutes Bearbeiten weiter.
  const refundCents = refundTouched ? toCents(refundInput) : (savedOverride ?? suggestedRefund);
  const deviates = refundCents != null && refundCents !== suggestedRefund;
  const refundError =
    refundCents == null ? "Rückzahlungsbetrag ungültig"
    : dep != null && refundCents > dep ? "Rückzahlung darf die erhaltene Kaution nicht übersteigen"
    : deviates && adjustReason.trim().length < 3 ? "Abweichender Betrag: bitte die Anpassung begründen (z. B. Kulanz oder zusätzlicher Abzug)"
    : null;
  const refund = finalized ? ctx.review.final_refund_cents : (refundCents ?? 0);
  const appliedEff = dep == null ? 0 : dep - (finalized ? ctx.review.final_refund_cents : (refundCents ?? 0));
  const adjCents = finalized
    ? ctx.review.final_deduct_applied_cents - Math.min(ctx.review.final_deduct_total_cents, ctx.review.final_deposit_cents)
    : appliedEff - Math.min(total, dep ?? 0);
  const adjReasonShown = finalized ? ctx.review.adjustment_reason : adjustReason.trim();

  const adjust = {
    refundCents: refundCents != null && refundCents !== suggestedRefund ? refundCents : null,
    reason: adjustReason.trim() || null,
    sendMail,
  };
  const currentKey = draftItems.error || refundError ? null : draftKey(draftItems.items, msg, adjust);
  const dirty = savedKey == null || currentKey !== savedKey;
  // Jede Änderung macht die Vorschau ungültig.
  useEffect(() => { setMail(null); }, [currentKey]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); } catch (e) { toast.error(e instanceof Error ? e.message : "Fehlgeschlagen"); } finally { setBusy(false); }
  };
  const doSave = () => run(async () => {
    if (draftItems.error) throw new Error(draftItems.error);
    if (refundError) throw new Error(refundError);
    await save({ data: { source, id, revision: ctx.review?.revision ?? null, items: draftItems.items, message: msg, adjust } });
    await onReload();
  }, "Entwurf gespeichert (kein Geld bewegt, keine Mail)");
  // 1-Klick: speichert den angezeigten Betrag als Entwurf (falls geändert) und schließt
  // sofort ab. Server prüft Revision + Betrag; Stripe läuft über den stabilen Key review-<id>.
  const doPayNow = () => {
    if (draftItems.error) { toast.error(draftItems.error); return; }
    if (refundError) { toast.error(refundError); return; }
    const amount = refundCents ?? 0;
    const label = source === "booking" ? `${eur(amount)} jetzt per Stripe an ${ctx.customerName} zurückzahlen?` : `${eur(amount)} an ${ctx.customerName} als manuelle Auszahlung abschließen?`;
    if (!window.confirm(`${label}\n\nDas kann nicht rückgängig gemacht werden.`)) return;
    return run(async () => {
      let revision: number | null = ctx.review?.revision ?? null;
      if (dirty || revision == null) {
        const r = await save({ data: { source, id, revision, items: draftItems.items, message: msg, adjust } });
        revision = r.revision;
      }
      onCtx(await finalize({ data: { source, id, revision: revision!, confirmName: ctx.customerName, confirmRefundCents: amount } }));
    }, source === "booking" ? "Rückzahlung bei Stripe beauftragt" : "Abschluss gespeichert");
  };
  const doPreview = () => run(async () => {
    if (draftItems.error) throw new Error(draftItems.error);
    if (refundError) throw new Error(refundError);
    const p = await preview({ data: { source, id, items: draftItems.items, message: msg, adjust } });
    setMail({ html: p.html, subject: p.subject, to: p.to });
  });
  const setT = (t: DeductionType, patch: Partial<Sel>) => setSel((s) => ({ ...s, [t]: { ...s[t], ...patch } }));
  const settlement = ctx.settlements?.find((s: any) => s.id === ctx.review?.settlement_id);

  const docLink = (d: { label: string; signedUrl: string | null; fileState: string; removedByUser: boolean } | null) =>
    !d ? null : (
      <li key={d.label}>
        {d.signedUrl ? (
          <a href={d.signedUrl} target="_blank" rel="noreferrer" className="underline">{d.label}</a>
        ) : (
          <span>{d.label} ({d.removedByUser ? "vom Kunden entfernt" : d.fileState === "path_rejected" ? "Zuordnung ungültig" : "nicht verfügbar"})</span>
        )}
      </li>
    );

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm underline">← Offene Kautionen</button>
      <div className="rounded-2xl border border-border bg-card p-4 space-y-1 text-sm">
        <h2 className="text-2xl font-bold">{ctx.customerName}</h2>
        <p className="text-sm font-semibold text-muted-foreground">Kaution</p>
        {ctx.userId && <p><a className="underline text-xs" href={`/admin?kunde=${ctx.userId}`}>Zum Kundenprofil</a></p>}
        <p>{ctx.bookingRef} · {ctx.vehicle}</p>
        <p>Beginn {berlinStamp(ctx.startMs)} · Ende {berlinStamp(ctx.endMs)}</p>
        <p>Rückgabe: {ctx.returnReportedMs ? `gemeldet ${berlinStamp(ctx.returnReportedMs)}` : "noch nicht bestätigt"}</p>
        {details?.customer && (
          <p className="text-xs text-muted-foreground">
            {[details.customer.email, details.customer.phone, details.customer.address].filter(Boolean).join(" · ")}
          </p>
        )}
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
        </div>
      )}
      {ctx.photos.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold">Alle Fahrtfotos</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {ctx.photos.filter((p: any) => photoUrls[p.photo_url]).map((p: any) => (
              <a key={p.photo_url} href={photoUrls[p.photo_url]} target="_blank" rel="noreferrer" className="block">
                <img src={photoUrls[p.photo_url]} alt={photoLabel(p.photo_type)} className="aspect-square w-full object-cover rounded-lg border border-border" loading="lazy" />
                <span className="text-[10px] text-muted-foreground">{photoLabel(p.photo_type)}</span>
              </a>
            ))}
          </div>
        </div>
      )}
      {details && (details.documents.license.front || details.documents.license.back || details.documents.id.front || details.documents.id.back || details.documents.others.length > 0) && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-1 text-sm">
          <h3 className="text-sm font-semibold">Kundendokumente</h3>
          <ul className="list-disc pl-5 space-y-1">
            {docLink(details.documents.license.front)}
            {docLink(details.documents.license.back)}
            {docLink(details.documents.id.front)}
            {docLink(details.documents.id.back)}
            {details.documents.others.map((d) => docLink(d))}
          </ul>
          <p className="text-[10px] text-muted-foreground">Links sind kurzlebig signiert und laufen nach wenigen Minuten ab.</p>
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
          <button disabled={busy} onClick={() => run(async () => { const c = toCents(depAmount || "0"); if (c == null) throw new Error("Betrag ungültig"); await recordDeposit({ data: { source, id, cents: c, method: depMethod } }); await onReload(); }, "Kaution erfasst")} className="rounded-full border border-border px-4 py-2 text-xs font-semibold">Kaution speichern</button>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">Abzugspositionen {finalized && "(abgeschlossen)"}</h3>
        <p className="text-xs text-muted-foreground">Nichts ist vorausgewählt. Bei jedem angeklickten Punkt steht, was abgezogen wird.</p>
        {TYPES.map((t) => {
          const def = DEDUCTION_DEFS[t]; const s = sel[t];
          const disabled = finalized || (t === "extra_km" && ((!ctx.extraKm.cents && !ctx.extraKm.rateCents) || ctx.extraKm.alreadyPaid)) || (t === "documentation_fee" && !ctx.docFee.allowed && !s.checked);
          return (
            <div key={t} className="rounded-xl bg-secondary p-3 space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={s.checked} disabled={disabled} onChange={(e) => setT(t, { checked: e.target.checked })} className="mt-1" />
                <span className="flex-1"><strong>{def.label}</strong>{s.checked && <span className="float-right">{eur(lineOf(t))}</span>}
                  <span className="block text-xs text-muted-foreground">{def.source}{t === "documentation_fee" ? ` · ${ctx.docFee.why}` : ""}{t === "extra_km" ? ` · ${ctx.extraKm.cents ? `${eur(ctx.extraKm.cents)}${ctx.extraKm.alreadyPaid ? " bereits bezahlt" : ""}` : ctx.extraKm.rateCents ? `${eur(ctx.extraKm.rateCents)}/km · Anzahl km eingeben` : "keine Forderung"}` : ""}</span>
                </span>
              </label>
              {s.checked && !finalized && (
                <div className="grid gap-2">
                  {t === "extra_km" && !ctx.extraKm.cents && <input value={s.quantity} onChange={(e) => setT(t, { quantity: e.target.value })} inputMode="numeric" placeholder="Mehrkilometer (km)" aria-label="Mehrkilometer (km)" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />}
                  {def.mode === "per_unit" && <input value={s.quantity} onChange={(e) => setT(t, { quantity: e.target.value })} inputMode="numeric" placeholder={def.unitLabel} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />}
                  {(def.mode === "free" || def.mode === "amount_plus_fee") && <input value={s.amount} onChange={(e) => setT(t, { amount: e.target.value })} inputMode="decimal" placeholder={def.mode === "amount_plus_fee" ? "Tatsächliche Tankkosten in €" : t === "extension" ? "Vereinbarter Betrag in €" : "Betrag in €"} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />}
                  <input value={s.reason} onChange={(e) => setT(t, { reason: e.target.value })} placeholder={t === "extension" ? "Begründung (Pflicht), z. B. 1 Tag verlängert" : def.reasonRequired ? "Begründung (Pflicht, für Kunden sichtbar)" : "Begründung (optional, für Kunden sichtbar)"} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
              )}
            </div>
          );
        })}
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} disabled={finalized} placeholder="Zusätzliche Nachricht an den Kunden (optional)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" rows={3} />
        <div className="text-sm space-y-1">
          <div className="flex justify-between"><span>Kaution</span><strong>{dep == null ? "nicht erfasst" : eur(dep)}</strong></div>
          <div className="flex justify-between"><span>Abzüge (Positionen)</span><strong>{eur(finalized ? ctx.review.final_deduct_total_cents : total)}</strong></div>
          {adjCents !== 0 && (
            <div className="flex justify-between">
              <span>{adjCents < 0 ? "Kulanz (Erlass)" : "Zusätzlicher Abzug"}</span>
              <strong>{adjCents < 0 ? `−${eur(-adjCents)}` : `+${eur(adjCents)}`}{adjReasonShown ? ` · ${adjReasonShown}` : ""}</strong>
            </div>
          )}
          <div className="flex justify-between"><span>Verrechnet mit Kaution</span><strong>{eur(finalized ? ctx.review.final_deduct_applied_cents : appliedEff)}</strong></div>
          <div className="flex justify-between"><span>Rückzahlung</span><strong>{eur(refund)}</strong></div>
          {(finalized ? ctx.review.final_outstanding_cents : outstanding) > 0 && <div className="flex justify-between"><span>Offene Restforderung (keine automatische Abbuchung)</span><strong>{eur(finalized ? ctx.review.final_outstanding_cents : outstanding)}</strong></div>}
        </div>
        {!finalized && dep != null && (
          <div className="rounded-xl border border-border p-3 space-y-2">
            <label className="text-sm font-semibold">Wie viel Kaution möchtest du zurückzahlen?</label>
            <div className="flex items-center gap-2">
              <input
                value={refundTouched ? refundInput : toEuro(savedOverride ?? suggestedRefund)}
                onChange={(e) => { setRefundTouched(true); setRefundInput(e.target.value); }}
                inputMode="decimal"
                className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <span className="text-xs text-muted-foreground">Vorschlag: {eur(suggestedRefund)} (Kaution minus Abzüge)</span>
            </div>
            {deviates && (
              <input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Begründung der Anpassung (Pflicht), z. B. Kulanz oder zusätzlicher Abzug" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            )}
            {refundError && (refundTouched || deviates) && <p className="text-xs font-semibold">{refundError}</p>}
            <button disabled={busy || !!refundError || !!draftItems.error} onClick={doPayNow} className="w-full rounded-full bg-foreground text-background py-2.5 text-sm font-semibold disabled:opacity-50">
              {(refundCents ?? 0) === 0 ? "Kaution einbehalten und abschließen" : source === "booking" ? `${eur(refundCents ?? 0)} jetzt per Stripe zurückzahlen` : `${eur(refundCents ?? 0)} manuell auszahlen & abschließen`}
            </button>
          </div>
        )}
        {!finalized && (
          <label className="flex items-start gap-2 text-sm rounded-xl bg-secondary p-3">
            <input type="checkbox" checked={sendMail} onChange={(e) => setSendMail(e.target.checked)} className="mt-1" />
            <span>Möchtest du zusätzlich eine automatische E-Mail an den Kunden senden? Sie erklärt freundlich die angeklickten Punkte und den Rückzahlungsbetrag.</span>
          </label>
        )}
        {!finalized && (
          <div className="grid grid-cols-2 gap-2">
            <button disabled={busy} onClick={doSave} className="rounded-full border border-border py-2 text-sm font-semibold">Entwurf speichern</button>
            <button disabled={busy || dep == null || dirty || !sendMail} title={dirty ? "Erst speichern" : !sendMail ? "Kundenmail ist ausgeschaltet" : undefined} onClick={doPreview} className="rounded-full border border-border py-2 text-sm font-semibold">Mailvorschau</button>
          </div>
        )}
      </div>

      {mail && !dirty && (
        <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
          <p className="text-xs">Vorschau an {mail.to ?? "keine Adresse"} · {mail.subject}</p>
          <iframe title="Mailvorschau" srcDoc={mail.html} sandbox="" className="w-full h-[480px] rounded-lg border border-border bg-background" />
        </div>
      )}

      {!finalized && ctx.review && dep != null && (
        <div className="rounded-2xl border-2 border-foreground p-4 space-y-2">
          <h3 className="text-sm font-semibold">Kaution abschließen</h3>
          <p className="text-sm">Abschluss für <strong>{ctx.customerName}</strong> mit Rückzahlung <strong>{eur(refund)}</strong>{source === "booking" ? " auf die Originalzahlung (nur Kautionsanteil)" : " (manuell, separate Bestätigung)"}. Gilt für den zuletzt gespeicherten Entwurf.{sendMail ? " Die Kundenmail ist eingeschaltet." : " Es wird keine Kundenmail gesendet."}</p>
          {dirty && <p className="text-xs font-semibold">Ungespeicherte Änderungen: bitte zuerst „Entwurf speichern“. Abgeschlossen wird nur der gespeicherte Entwurf.</p>}
          <button disabled={busy || dirty} onClick={() => run(async () => { onCtx(await finalize({ data: { source, id, revision: ctx.review.revision, confirmName: ctx.customerName, confirmRefundCents: refund } })); }, "Abschluss gespeichert")} className="w-full rounded-full bg-foreground text-background py-2.5 text-sm font-semibold disabled:opacity-50">
            {refund === 0 ? `Kaution von ${ctx.customerName} vollständig einbehalten und abschließen` : source === "manual" ? `Abschließen: ${eur(refund)} an ${ctx.customerName} manuell auszahlen` : `${eur(refund)} an ${ctx.customerName} zurückzahlen und abschließen`}
          </button>
        </div>
      )}

      {finalized && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2 text-sm">
          <h3 className="font-semibold">Status</h3>
          {source === "booking" ? (
            <p>Stripe: {settlement ? `${SETTLEMENT_STATE_DE[settlement.status] ?? settlement.status}${settlement.failure_reason ? ` · ${settlement.failure_reason}` : ""}` : "Auftrag noch nicht angelegt"}</p>
          ) : (
            <p>Manuelle Rückzahlung: {ctx.review.manual_payout_status === "confirmed" ? `bestätigt (${ctx.review.manual_payout_method})` : ctx.review.manual_payout_status === "open" ? "offen" : "nicht erforderlich"}</p>
          )}
          <p>Kundenmail: {ctx.review.send_closing_mail === false ? "vom Admin ausgeschaltet" : ctx.closingMail ? `${MAIL_STATE_DE[ctx.closingMail.status] ?? ctx.closingMail.status}${ctx.closingMail.blocked_reason ? ` · ${ctx.closingMail.blocked_reason}` : ""}` : "noch nicht erstellt (erst bei bestätigtem oder beauftragtem Zahlungsstand)"}</p>
          <div className="flex flex-wrap gap-2">
            {source === "booking" && !settlement && <button disabled={busy} onClick={() => run(async () => onCtx(await cont({ data: { source, id } })), "Fortgesetzt")} className="rounded-full border border-border px-4 py-2 text-xs font-semibold">Rückzahlung fortsetzen (gleicher Auftrag)</button>}
            {source === "booking" && settlement?.status === "processing" && <button disabled={busy} onClick={() => run(async () => onCtx(await cont({ data: { source, id } })), "Erneut versucht")} className="rounded-full border border-border px-4 py-2 text-xs font-semibold">Erneut versuchen (gleicher Key)</button>}
            <button disabled={busy} onClick={() => run(async () => onCtx(await refresh({ data: { source, id } })), "Status abgeglichen")} className="rounded-full border border-border px-4 py-2 text-xs font-semibold">Status abgleichen</button>
          </div>
          {source === "manual" && ctx.review.manual_payout_status === "open" && (
            <div className="flex gap-2 pt-2">
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="rounded-lg border border-border bg-background px-2 text-sm">
                <option value="cash">Bar</option><option value="transfer">Überweisung</option><option value="sumup">SumUp</option><option value="other">Sonstiges</option>
              </select>
              <button disabled={busy} onClick={() => run(async () => onCtx(await confirmPayout({ data: { source, id, method: payMethod, confirmRefundCents: ctx.review.final_refund_cents } })), "Rückzahlung bestätigt")} className="flex-1 rounded-full bg-foreground text-background py-2 text-xs font-semibold">{eur(ctx.review.final_refund_cents)} an {ctx.customerName} ausgezahlt bestätigen</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
