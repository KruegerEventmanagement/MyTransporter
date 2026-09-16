import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Mail, Plus, Trash2 } from "lucide-react";
import { renderAdminDocument, sendAdminDocument } from "@/lib/admin-documents.functions";
import { computeDocTotals, fmtEurC, type DocItemInput } from "@/lib/doc-totals";

type Kind = "invoice" | "offer";

const inputCls =
  "w-full rounded-xl bg-secondary px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-foreground";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function autoNumber(kind: Kind) {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${kind === "offer" ? "AN" : "MT"}-${ym}-${rand}`;
}

/** Nimmt Komma oder Punkt als Dezimaltrennzeichen; ungültige Eingabe = null. */
function parseNum(value: string): number | null {
  let cleaned = value.replace(/\s/g, "").replace(/€/g, "");
  if (cleaned.includes(",")) cleaned = cleaned.replace(/\./g, "");
  cleaned = cleaned.replace(",", ".");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function DocumentBuilder() {
  const [kind, setKind] = useState<Kind>("invoice");
  const [number, setNumber] = useState(() => autoNumber("invoice"));
  const [date, setDate] = useState(todayIso);

  const [company, setCompany] = useState("");
  const [attention, setAttention] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [vatId, setVatId] = useState("");

  const [vehicle, setVehicle] = useState("Citroën Jumper");
  const [vin, setVin] = useState("");
  const [pickup, setPickup] = useState("");
  const [ret, setRet] = useState("");
  const [freeKm, setFreeKm] = useState("");
  const [kmPrice, setKmPrice] = useState("0.90");

  const [items, setItems] = useState<DocItemInput[]>([
    { label: "Miete Transporter", amount: 0, mode: "net", vat: true },
    { label: "Kaution", amount: 200, mode: "gross", vat: false },
  ]);
  const [note, setNote] = useState("");

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"pdf" | "mail" | null>(null);

  const render = useServerFn(renderAdminDocument);
  const send = useServerFn(sendAdminDocument);

  const totals = useMemo(() => computeDocTotals(items), [items]);

  function switchKind(k: Kind) {
    setKind(k);
    setNumber(autoNumber(k));
  }

  function updateItem(i: number, patch: Partial<DocItemInput>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function buildDoc() {
    const cleanedItems = items
      .filter((it) => it.label.trim().length > 0)
      .map((it) => ({
        ...it,
        label: it.label.trim(),
        amount: Number.isFinite(Number(it.amount)) ? Number(it.amount) : 0,
      }));
    if (cleanedItems.length === 0)
      throw new Error("Bitte mindestens eine Position mit Bezeichnung angeben.");
    if (!number.trim()) throw new Error("Bitte eine Nummer für das Dokument angeben.");

    const freeKmNum = parseNum(freeKm);
    const kmPriceNum = parseNum(kmPrice);
    return {
      kind,
      number: number.trim(),
      date,
      recipient: {
        company: company.trim() || undefined,
        attention: attention.trim() || undefined,
        street: street.trim() || undefined,
        city: city.trim() || undefined,
        email: email.trim() || undefined,
        vatId: vatId.trim() || undefined,
      },
      service: {
        vehicle: vehicle.trim() || undefined,
        vin: vin.trim() || undefined,
        pickup: pickup.trim() || undefined,
        ret: ret.trim() || undefined,
        freeKm: freeKmNum === null ? null : Math.max(0, Math.round(freeKmNum)),
        kmPrice: kmPriceNum === null ? null : Math.max(0, kmPriceNum),
      },
      items: cleanedItems,
      note: note.trim() || undefined,
    };
  }

  function friendlyError(e: unknown, fallback: string): string {
    if (e instanceof Error && e.message.trim().startsWith("[")) return fallback;
    return e instanceof Error && e.message ? e.message : fallback;
  }

  async function handleDownload() {
    setBusy("pdf");
    try {
      const doc = buildDoc();
      const res = await render({ data: doc });
      const bin = atob(res.pdfBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF erstellt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF konnte nicht erstellt werden");
    } finally {
      setBusy(null);
    }
  }

  async function handleSend() {
    setBusy("mail");
    try {
      const doc = buildDoc();
      if (!email.trim()) throw new Error("Bitte eine E-Mail-Adresse des Empfängers angeben.");
      const subj =
        subject.trim() ||
        `${kind === "offer" ? "Angebot" : "Rechnung"} MyTransporter · ${doc.number}`;
      const msg =
        message.trim() ||
        `Hallo${attention.trim() ? ` ${attention.trim()}` : ""},\n\nanbei ${
          kind === "offer" ? "unser Angebot" : "die Rechnung"
        } als PDF.\n\nViele Grüße\nChristian Krüger\nMyTransporter`;
      await send({ data: { doc, to: email.trim(), subject: subj, message: msg } });
      toast.success(`Per E-Mail an ${email.trim()} gesendet`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "E-Mail konnte nicht gesendet werden");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {(["invoice", "offer"] as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => switchKind(k)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              kind === k ? "bg-foreground text-background" : "bg-secondary"
            }`}
          >
            {k === "invoice" ? "Rechnung" : "Angebot"}
          </button>
        ))}
      </div>

      <section className="p-4 rounded-2xl bg-card border border-border space-y-3">
        <h3 className="font-semibold text-sm">Dokument</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{kind === "offer" ? "Angebotsnummer" : "Rechnungsnummer"}</label>
            <input className={inputCls} value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Datum</label>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      </section>

      <section className="p-4 rounded-2xl bg-card border border-border space-y-3">
        <h3 className="font-semibold text-sm">Empfänger</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Firma / Name</label>
            <input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Eventkartell GmbH" />
          </div>
          <div>
            <label className={labelCls}>Zu Händen</label>
            <input className={inputCls} value={attention} onChange={(e) => setAttention(e.target.value)} placeholder="z.Hd. Projektmanagement …" />
          </div>
          <div>
            <label className={labelCls}>Straße</label>
            <input className={inputCls} value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Hauptstraße 20" />
          </div>
          <div>
            <label className={labelCls}>PLZ / Ort</label>
            <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="70839 Gerlingen" />
          </div>
          <div>
            <label className={labelCls}>E-Mail (für Versand)</label>
            <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>USt-IdNr. (optional)</label>
            <input className={inputCls} value={vatId} onChange={(e) => setVatId(e.target.value)} />
          </div>
        </div>
      </section>

      <section className="p-4 rounded-2xl bg-card border border-border space-y-3">
        <h3 className="font-semibold text-sm">Leistung</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Fahrzeug</label>
            <input className={inputCls} value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Fahrgestellnummer (FIN)</label>
            <input className={inputCls} value={vin} onChange={(e) => setVin(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Abholung</label>
            <input className={inputCls} value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="20.07.2026, 08:00 Uhr" />
          </div>
          <div>
            <label className={labelCls}>Rückgabe</label>
            <input className={inputCls} value={ret} onChange={(e) => setRet(e.target.value)} placeholder="07.09.2026, 08:00 Uhr" />
          </div>
          <div>
            <label className={labelCls}>Freikilometer</label>
            <input className={inputCls} inputMode="numeric" value={freeKm} onChange={(e) => setFreeKm(e.target.value)} placeholder="10500" />
          </div>
          <div>
            <label className={labelCls}>Preis je weiterer km (€)</label>
            <input className={inputCls} inputMode="decimal" value={kmPrice} onChange={(e) => setKmPrice(e.target.value)} />
          </div>
        </div>
      </section>

      <section className="p-4 rounded-2xl bg-card border border-border space-y-3">
        <h3 className="font-semibold text-sm">Positionen</h3>
        <p className="text-xs text-muted-foreground">
          Negativer Betrag = Nachlass / Rabatt. „MwSt." abwählen für Positionen ohne Umsatzsteuer (z.B. Kaution).
        </p>
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 sm:col-span-5">
                <label className={labelCls}>Bezeichnung</label>
                <input className={inputCls} value={it.label} onChange={(e) => updateItem(i, { label: e.target.value })} />
              </div>
              <div className="col-span-5 sm:col-span-3">
                <label className={labelCls}>Betrag (€)</label>
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={String(it.amount)}
                  onChange={(e) => updateItem(i, { amount: Number(e.target.value.replace(",", ".")) || 0 })}
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <label className={labelCls}>Basis</label>
                <select
                  className={inputCls}
                  value={it.mode}
                  onChange={(e) => updateItem(i, { mode: e.target.value as "net" | "gross" })}
                >
                  <option value="net">netto</option>
                  <option value="gross">brutto</option>
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1 flex items-center gap-1 pb-3">
                <input
                  id={`vat-${i}`}
                  type="checkbox"
                  checked={it.vat}
                  onChange={(e) => updateItem(i, { vat: e.target.checked })}
                  className="w-4 h-4 accent-foreground"
                />
                <label htmlFor={`vat-${i}`} className="text-xs">MwSt</label>
              </div>
              <div className="col-span-1 pb-2">
                <button
                  onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                  className="p-2 rounded-full bg-secondary"
                  aria-label="Position entfernen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => setItems((prev) => [...prev, { label: "", amount: 0, mode: "net", vat: true }])}
          className="rounded-full bg-secondary px-3 py-2 text-xs font-medium flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Position hinzufügen
        </button>

        <div className="pt-3 border-t border-border text-sm space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Zwischensumme netto</span><span>{fmtEurC(totals.vatNetC)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>zzgl. 19% USt.</span><span>{fmtEurC(totals.vatVatC)}</span>
          </div>
          {totals.plainC !== 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Ohne USt.</span><span>{fmtEurC(totals.plainC)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-base pt-1">
            <span>Gesamtbetrag</span><span>{fmtEurC(totals.totalC)}</span>
          </div>
        </div>
      </section>

      <section className="p-4 rounded-2xl bg-card border border-border space-y-3">
        <h3 className="font-semibold text-sm">Hinweis auf dem Dokument (optional)</h3>
        <textarea
          className={`${inputCls} min-h-[70px]`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="z.B. Bitte überweisen Sie den Betrag innerhalb von zwei Wochen."
        />
      </section>

      <section className="p-4 rounded-2xl bg-card border border-border space-y-3">
        <h3 className="font-semibold text-sm">E-Mail-Versand</h3>
        <div>
          <label className={labelCls}>Betreff (leer = automatisch)</label>
          <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Nachricht (leer = automatisch)</label>
          <textarea className={`${inputCls} min-h-[100px]`} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
      </section>

      <div className="flex flex-wrap gap-2 pb-8">
        <button
          onClick={handleDownload}
          disabled={busy !== null}
          className="rounded-full bg-foreground text-background px-5 py-3 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> {busy === "pdf" ? "Erstelle…" : "PDF herunterladen"}
        </button>
        <button
          onClick={handleSend}
          disabled={busy !== null}
          className="rounded-full bg-secondary px-5 py-3 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
        >
          <Mail className="w-4 h-4" /> {busy === "mail" ? "Sende…" : "Per E-Mail senden"}
        </button>
      </div>
    </div>
  );
}
