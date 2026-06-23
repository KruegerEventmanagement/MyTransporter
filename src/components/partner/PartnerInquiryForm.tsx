import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { submitPartnerInquiry } from "@/lib/partner-inquiry.functions";
import { PACKAGES_BY_VIEW, type PartnerPackageId } from "@/lib/partner-packages";
import { VIEWS, type ViewId } from "@/lib/partner-zones";

interface Props {
  selectedPackage: PartnerPackageId;
  onPackageChange: (id: PartnerPackageId) => void;
}

export function PartnerInquiryForm({ selectedPackage, onPackageChange }: Props) {
  const submit = useServerFn(submitPartnerInquiry);
  const [form, setForm] = useState({
    company: "", name: "", email: "", phone: "",
    years: 1 as 1 | 2 | 3, message: "", consent: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.consent) {
      setError("Bitte stimme der Verarbeitung deiner Anfrage zu.");
      return;
    }
    setLoading(true);
    try {
      await submit({
        data: {
          company: form.company.trim(),
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          packageId: selectedPackage,
          years: form.years,
          message: form.message.trim(),
        },
      });
      setDone(true);
    } catch (err) {
      console.error(err);
      setError("Anfrage konnte nicht gesendet werden. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="p-8 rounded-2xl bg-card border border-border text-center">
        <div className="w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-foreground">Danke für deine Anfrage!</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Wir melden uns innerhalb von 1-2 Werktagen bei dir mit einem konkreten Angebot.
        </p>
      </div>
    );
  }

  const input =
    "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground";
  const viewOrder: ViewId[] = ["driver", "passenger", "rear", "front"];

  return (
    <form onSubmit={handleSubmit} className="p-6 sm:p-8 rounded-2xl bg-card border border-border space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <input className={input} placeholder="Firma (optional)" value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })} maxLength={120} />
        <input className={input} placeholder="Dein Name *" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <input type="email" className={input} placeholder="E-Mail *" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} required maxLength={255} />
        <input type="tel" className={input} placeholder="Telefon (optional)" value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <select className={input} value={selectedPackage}
          onChange={(e) => onPackageChange(e.target.value as PartnerPackageId)}>
          {viewOrder.map((v) => (
            <optgroup key={v} label={VIEWS[v].label}>
              {PACKAGES_BY_VIEW[v].map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.sizeLabel} · {p.monthly} € netto/Mon.
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select className={input} value={form.years}
          onChange={(e) => setForm({ ...form, years: Number(e.target.value) as 1 | 2 | 3 })}>
          <option value={1}>1 Jahr Laufzeit</option>
          <option value={2}>2 Jahre Laufzeit</option>
          <option value={3}>3 Jahre Laufzeit</option>
        </select>
      </div>
      <textarea className={`${input} min-h-[110px] resize-y`}
        placeholder="Beschreibung deines Motivs, Wünsche, Fragen…"
        value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
        maxLength={2000} />
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={form.consent}
          onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-0.5" />
        <span>
          Ich bin damit einverstanden, dass meine Angaben zur Bearbeitung der Anfrage verwendet werden.
          Weitere Infos in der <a href="/datenschutz" className="underline">Datenschutzerklärung</a>.
        </span>
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button type="submit" disabled={loading || !form.name || !form.email}
        className="w-full rounded-xl bg-foreground text-background py-3 font-medium text-sm transition-all hover:opacity-90 flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
        {loading ? "Wird gesendet…" : "Anfrage senden"}
        <ChevronRight className="w-4 h-4" />
      </button>
    </form>
  );
}
