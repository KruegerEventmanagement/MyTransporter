import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { submitWebAdInquiry } from "@/lib/web-ad-inquiry.functions";
import {
  WEB_AD_PRICE_NET_EUR,
  WEB_AD_SLOTS,
  WEB_AD_TERM_DAYS,
  type WebAdSlot,
} from "@/lib/web-ad-inquiry";

export function WebAdInquiryForm({ initialSlot = "any" }: { initialSlot?: WebAdSlot }) {
  const submit = useServerFn(submitWebAdInquiry);
  const [form, setForm] = useState({
    company: "", contactName: "", email: "", website: "",
    slot: initialSlot as WebAdSlot, startDate: "", message: "", consent: false, hp: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.consent) {
      setError("Bitte stimme der Verarbeitung deiner Anfrage zu.");
      return;
    }
    setLoading(true);
    try {
      const res = await submit({ data: form });
      if (res && res.ok === true) setDone(true);
      else setError(res && "error" in res ? res.error : "Anfrage konnte nicht gesendet werden.");
    } catch {
      setError("Anfrage konnte nicht gesendet werden. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div role="status" className="rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-foreground">Anfrage eingegangen</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Wir prüfen die Verfügbarkeit und melden uns mit einem Angebot. Es ist noch keine Buchung entstanden.
        </p>
      </div>
    );
  }

  const input =
    "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-2xl border border-border bg-card p-6 sm:p-8" aria-label="Website-Werbeplatz anfragen">
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={input} placeholder="Firma *" aria-label="Firma" value={form.company} required maxLength={120}
          onChange={(e) => setForm({ ...form, company: e.target.value })} />
        <input className={input} placeholder="Ansprechpartner *" aria-label="Ansprechpartner" value={form.contactName} required maxLength={120}
          onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input type="email" className={input} placeholder="E-Mail *" aria-label="E-Mail" value={form.email} required maxLength={255}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input type="url" className={input} placeholder="Website (https://…)" aria-label="Website" value={form.website} maxLength={255}
          onChange={(e) => setForm({ ...form, website: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-muted-foreground">
          Platz
          <select className={`${input} mt-1`} value={form.slot}
            onChange={(e) => setForm({ ...form, slot: e.target.value as WebAdSlot })}>
            {(Object.keys(WEB_AD_SLOTS) as WebAdSlot[]).map((k) => (
              <option key={k} value={k}>{WEB_AD_SLOTS[k]}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">
          Gewünschter Start
          <input type="date" className={`${input} mt-1`} value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </label>
      </div>
      <textarea className={`${input} min-h-[100px] resize-y`} placeholder="Motiv, Zielseite, Fragen…" aria-label="Nachricht"
        value={form.message} maxLength={2000} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      {/* Honeypot – für Menschen unsichtbar */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Bitte leer lassen<input tabIndex={-1} autoComplete="off" value={form.hp}
          onChange={(e) => setForm({ ...form, hp: e.target.value })} /></label>
      </div>
      <p className="rounded-xl bg-secondary/60 px-3 py-2 text-xs text-foreground">
        {WEB_AD_PRICE_NET_EUR} € netto pro {WEB_AD_TERM_DAYS} Tage zzgl. gesetzlicher Umsatzsteuer. Unverbindliche
        Anfrage – keine Buchung, keine Zahlung, keine automatische Verlängerung.
      </p>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={form.consent} className="mt-0.5"
          onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
        <span>
          Ich bin einverstanden, dass meine Angaben zur Bearbeitung der Anfrage verwendet werden. Mehr in der{" "}
          <a href="/datenschutz" className="underline">Datenschutzerklärung</a>.
        </span>
      </label>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <button type="submit" disabled={loading}
        className="flex w-full items-center justify-center gap-1 rounded-xl bg-foreground py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? "Wird gesendet…" : `Werbeplatz für ${WEB_AD_PRICE_NET_EUR} € netto anfragen`}
        <ChevronRight className="h-4 w-4" />
      </button>
    </form>
  );
}
