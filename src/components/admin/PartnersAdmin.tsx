import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { Copy, Download, Loader2, Plus, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPartnerStats, savePartnerFn, sendPartnerTestMailFn } from "@/lib/partners.functions";
import { SCAN_MAIL_LIMIT } from "@/lib/partner-notifications";
import type { PartnerStats } from "@/lib/partners-admin";
import { PARTNER_ATTRIBUTION_DAYS, formatEuro, partnerTrackingUrl, PUBLIC_SITE_ORIGIN } from "@/lib/partner-tracking";

const QR_OPTS = { errorCorrectionLevel: "M" as const, margin: 4, color: { dark: "#000000", light: "#ffffff" } };

function download(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}

function csvCell(v: string | number) {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const euroPlain = (c: number) => (c / 100).toFixed(2).replace(".", ",");

function exportCsv(p: PartnerStats, from: string, to: string) {
  const head = ["Partner", "Buchungsreferenz", "Zugeordnet am", "Mietbeginn", "Fahrzeug", "Status", "Miete brutto (EUR)", "Mieterstattungen (EUR)", "Provisionsgrundlage (EUR)", "Satz (%)", "Provision (EUR)"];
  const lines = p.rows.map((r) => [p.name, r.reference, r.attributedAt.slice(0, 10), r.startDate, r.vehicle, r.status, euroPlain(r.rentCents), euroPlain(r.refundedCents), euroPlain(r.baseCents), String(r.ratePercent).replace(".", ","), euroPlain(r.commissionCents)]);
  lines.push(["Summe", "", "", "", "", "", "", "", euroPlain(p.baseCents), "", euroPlain(p.commissionCents)]);
  const csv = "\uFEFF" + [head, ...lines].map((l) => l.map(csvCell).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  download(`provision-${p.slug}-${from || "anfang"}-bis-${to || "heute"}.csv`, url);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function QrPreview({ slug }: { slug: string }) {
  const url = partnerTrackingUrl(slug);
  const [png, setPng] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(url, { ...QR_OPTS, width: 1024 }).then(setPng).catch(() => setPng(null));
  }, [url]);
  const svg = async () => {
    const s = await QRCode.toString(url, { ...QR_OPTS, type: "svg" });
    download(`qr-${slug}.svg`, URL.createObjectURL(new Blob([s], { type: "image/svg+xml" })));
  };
  return (
    <div className="flex flex-col items-center gap-2">
      {png ? <img src={png} alt={`QR-Code für ${url}`} className="h-40 w-40 border border-border bg-background" /> : <div className="h-40 w-40 animate-pulse bg-muted" />}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={!png} onClick={() => png && download(`qr-${slug}.png`, png)}><Download className="h-4 w-4" /> PNG</Button>
        <Button size="sm" variant="outline" onClick={svg}><Download className="h-4 w-4" /> SVG</Button>
      </div>
    </div>
  );
}

type Form = { id: string | null; slug: string; name: string; commissionPercent: string; targetPath: string; active: boolean; notes: string };
const EMPTY: Form = { id: null, slug: "", name: "", commissionPercent: "10", targetPath: "/", active: true, notes: "" };

export function PartnersAdmin() {
  const load = useServerFn(getPartnerStats);
  const save = useServerFn(savePartnerFn);
  const testMail = useServerFn(sendPartnerTestMailFn);
  const sendTest = async (id: string) => {
    try {
      const r = await testMail({ data: { partnerId: id } });
      if (r.sent) toast.success("TEST-Mail an info@mytransporter.org gesendet");
      else toast.error("TEST-Mail nicht bestätigt – wird ggf. wiederholt");
      void refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "TEST-Mail fehlgeschlagen"); }
  };
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<PartnerStats[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setErr(null);
    try { setData(await load({ data: { from: from || null, to: to || null } })); }
    catch (e) { setErr(e instanceof Error ? e.message : "Laden fehlgeschlagen"); }
  }, [load, from, to]);
  useEffect(() => { void refresh(); }, [refresh]);

  const copy = async (t: string) => {
    try { await navigator.clipboard.writeText(t); toast.success("Link kopiert"); } catch { toast.error("Kopieren nicht möglich"); }
  };

  const submit = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await save({ data: { ...form, commissionPercent: Number(form.commissionPercent.replace(",", ".")) } });
      toast.success("Partner gespeichert");
      setForm(null);
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen"); }
    finally { setSaving(false); }
  };

  const toggle = async (p: PartnerStats) => {
    try {
      await save({ data: { id: p.id, slug: p.slug, name: p.name, commissionPercent: p.ratePercent, targetPath: p.targetPath, active: !p.active, notes: p.notes } });
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Fehler"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold"><QrCode className="h-5 w-5" /> Partner & QR-Codes</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Provisionsgrundlage: tatsächlich bezahlter Brutto-Mietpreis nach Rabatten inkl. Zusatzpakete, abzüglich Erstattungen auf die Miete – ohne Kaution, ohne Mehrkilometer/Abzüge aus der Kaution. Unbezahlte und stornierte Buchungen zählen 0 €. Zuordnung: letzter QR-Scan, wenn die Zahlung innerhalb von {PARTNER_ATTRIBUTION_DAYS} Tagen danach gestartet wird. Nur Abrechnungsübersicht, keine automatische Auszahlung.
          </p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Hinweis: Aufrufe werden immer anonym gezählt. Die Kennung für die spätere Buchungszuordnung wird nur bei Cookie-Einwilligung bis zu 30 Tage gespeichert; ohne Zustimmung zählt eine Buchung nur, wenn sie ohne Neuladen der Seite direkt nach dem Scan erfolgt. Zugeordnete Buchungen sind daher eine Untergrenze.
          </p>
        </div>
        <Button onClick={() => setForm({ ...EMPTY })}><Plus className="h-4 w-4" /> Partner anlegen</Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-3">
        <label className="text-sm">Von<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">Bis<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <Button variant="outline" onClick={() => { setFrom(""); setTo(""); }}>Gesamter Zeitraum</Button>
        <p className="text-xs text-muted-foreground">Aufrufe nach Scan-Datum, Buchungen nach Zuordnungsdatum.</p>
      </div>

      {form && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <h3 className="font-semibold">{form.id ? "Partner bearbeiten" : "Neuer Partner"}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Name<Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="text-sm">Kurzname im Link (fest)
              <Input value={form.slug} disabled={!!form.id} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} placeholder="z. B. obi-leonberg" />
            </label>
            <label className="text-sm">Provision (%)<Input inputMode="decimal" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} /></label>
            <label className="text-sm">Zielseite (intern)<Input value={form.targetPath} onChange={(e) => setForm({ ...form, targetPath: e.target.value })} placeholder="/" /></label>
            <label className="text-sm sm:col-span-2">Notiz<Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Aktiv</label>
          </div>
          <p className="text-xs text-muted-foreground">Ein geänderter Satz gilt nur für neue Buchungen; bestehende behalten ihren Satz.</p>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Speichern</Button>
            <Button variant="outline" onClick={() => setForm(null)}>Abbrechen</Button>
          </div>
        </div>
      )}

      {err && <p className="text-sm text-destructive">{err}</p>}
      {!data && !err && <Loader2 className="h-5 w-5 animate-spin" />}

      {data?.map((p) => {
        const link = partnerTrackingUrl(p.slug);
        const target = `${PUBLIC_SITE_ORIGIN}${p.targetPath}`;
        return (
          <section key={p.id} className="space-y-4 rounded-2xl border border-border p-4">
            <div className="flex flex-wrap gap-6">
              <QrPreview slug={p.slug} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold">{p.name}</h3>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs">{p.active ? "aktiv" : "deaktiviert"}</span>
                  <span className="text-xs text-muted-foreground">{p.ratePercent.toLocaleString("de-DE")} % Provision</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Trackinglink:</span><code className="break-all">{link}</code>
                  <Button size="sm" variant="ghost" onClick={() => copy(link)}><Copy className="h-4 w-4" /></Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Ziel:</span><code className="break-all">{target}</code>
                  <Button size="sm" variant="ghost" onClick={() => copy(target)}><Copy className="h-4 w-4" /></Button>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-4">
                  <Stat label="QR-Aufrufe" value={String(p.visits)} hint="Scans, keine eindeutigen Personen" />
                  <Stat label="Registrierungen" value={String(p.signups)} hint="neue, bestätigte Konten nach Scan" />
                  <Stat label="Zugeordnete Buchungen" value={`${p.bookings}`} hint={`davon bezahlt: ${p.paidBookings}`} />
                  <Stat label="Bezahlte Mieteinnahmen" value={formatEuro(p.baseCents)} hint="ohne Kaution, nach Erstattungen" />
                  <Stat label="Provision" value={formatEuro(p.commissionCents)} hint="berechnet, nicht ausgezahlt" />
                </div>
                <p className="pt-2 text-xs text-muted-foreground">
                  Interne Mails an info@mytransporter.org: {p.notify.sent} gesendet, {p.notify.open} offen/Wiederholung, {p.notify.review} manuell prüfen.
                  {" "}Scan-Mails: {p.notify.scanMails} – {p.notify.scanWithoutMail} Aufrufe ohne Mail (Limit oder vor Einführung der Mails; {SCAN_MAIL_LIMIT.perHour}/Stunde, {SCAN_MAIL_LIMIT.perDay}/Tag). Gezählt werden trotzdem alle Aufrufe.
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => sendTest(p.id)}>TEST-Mail</Button>
                  <Button size="sm" variant="outline" onClick={() => setForm({ id: p.id, slug: p.slug, name: p.name, commissionPercent: String(p.ratePercent), targetPath: p.targetPath, active: p.active, notes: p.notes ?? "" })}>Bearbeiten</Button>
                  <Button size="sm" variant="outline" onClick={() => toggle(p)}>{p.active ? "Deaktivieren" : "Aktivieren"}</Button>
                  <Button size="sm" variant="outline" onClick={() => exportCsv(p, from, to)}><Download className="h-4 w-4" /> CSV</Button>
                </div>
              </div>
            </div>
            {p.rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr><th className="py-1 pr-3">Ref.</th><th className="pr-3">Zugeordnet</th><th className="pr-3">Mietbeginn</th><th className="pr-3">Fahrzeug</th><th className="pr-3">Status</th><th className="pr-3 text-right">Miete</th><th className="pr-3 text-right">Erstattet</th><th className="pr-3 text-right">Grundlage</th><th className="text-right">Provision</th></tr>
                  </thead>
                  <tbody>
                    {p.rows.map((r) => (
                      <tr key={r.bookingId} className="border-t border-border">
                        <td className="py-1 pr-3 font-mono">{r.reference}</td>
                        <td className="pr-3">{new Date(r.attributedAt).toLocaleDateString("de-DE")}</td>
                        <td className="pr-3">{r.startDate}</td>
                        <td className="pr-3">{r.vehicle}</td>
                        <td className="pr-3">{r.status}</td>
                        <td className="pr-3 text-right">{formatEuro(r.rentCents)}</td>
                        <td className="pr-3 text-right">{formatEuro(r.refundedCents)}</td>
                        <td className="pr-3 text-right">{formatEuro(r.baseCents)}</td>
                        <td className="text-right">{formatEuro(r.commissionCents)} <span className="text-xs text-muted-foreground">({r.ratePercent.toLocaleString("de-DE")} %)</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-secondary p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}
