import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ExternalLink, FileText, RotateCw } from "lucide-react";
import {
  getCalendarEntryDetails,
  type CalendarEntryDetails,
  type DetailDoc,
} from "@/lib/calendar-details.functions";
import { birthAndAge, fmtBerlinDateTime, NOT_SET, NO_NOTES } from "@/lib/calendar-details";

const STATUS_LABELS: Record<string, string> = {
  paid: "Bezahlt",
  active: "Aktiv",
  in_progress: "Unterwegs",
  picked_up: "Abgeholt",
  returning: "Rückgabe läuft",
  completed: "Abgeschlossen",
  cancelled: "Storniert",
};

const eur = (v: number) => v.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-0.5 py-1 text-sm max-sm:grid-cols-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function Value({ v }: { v: string | null | undefined }) {
  return v ? <>{v}</> : <span className="text-muted-foreground">{NOT_SET}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pt-3 border-t border-border first:border-t-0 first:pt-0">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</h4>
      <dl>{children}</dl>
    </section>
  );
}

function DocPreview({ side, doc, onRetry }: { side: string; doc: DetailDoc | null; onRetry: () => void }) {
  const [broken, setBroken] = useState(false);
  if (!doc) {
    return (
      <figure className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
        <figcaption className="font-medium text-foreground">{side}</figcaption>
        <p className="mt-1">Nicht hinterlegt</p>
      </figure>
    );
  }
  return (
    <figure className="rounded-xl border border-border p-2 min-w-0">
      <figcaption className="text-xs font-medium flex items-start justify-between gap-2 mb-1.5 min-w-0">
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">{side}</span>
        {doc.removedByUser && (
          <span className="shrink-0 text-[10px] rounded bg-secondary px-1.5 py-0.5">Vom Nutzer entfernt</span>
        )}
      </figcaption>
      {doc.fileState === "path_rejected" ? (
        <p className="text-xs text-muted-foreground">
          Datei wird nicht angezeigt: Der gespeicherte Ablageort gehört nicht zu diesem Kunden bzw. Termin.
        </p>
      ) : !doc.signedUrl || broken ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Datei konnte nicht geladen werden.</p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
          >
            <RotateCw className="w-3 h-3" /> Erneut laden
          </button>
        </div>
      ) : doc.isPdf ? (
        <a
          href={doc.signedUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
        >
          <FileText className="w-3.5 h-3.5" />
          PDF öffnen
        </a>
      ) : (
        <a
          href={doc.signedUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="block rounded-lg overflow-hidden bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
          aria-label={`${side} vergrößert in neuem Tab öffnen`}
        >
          <img
            src={doc.signedUrl}
            alt={side}
            loading="lazy"
            onError={() => setBroken(true)}
            className="w-full max-w-full h-auto max-h-80 object-contain"
          />
          <span className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground">
            <ExternalLink className="w-3 h-3" /> Vergrößern
          </span>
        </a>
      )}
    </figure>
  );
}

function DocDisclosure({
  title,
  pair,
  onRetry,
}: {
  title: string;
  pair: { front: DetailDoc | null; back: DetailDoc | null };
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const count = (pair.front ? 1 : 0) + (pair.back ? 1 : 0);
  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
      >
        <span>
          {title} <span className="text-xs text-muted-foreground font-normal">({count}/2 Seiten)</span>
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id={panelId} className="grid gap-2 p-2 sm:grid-cols-2">
          <DocPreview side={`${title} · Vorderseite`} doc={pair.front} onRetry={onRetry} />
          <DocPreview side={`${title} · Rückseite`} doc={pair.back} onRetry={onRetry} />
        </div>
      )}
    </div>
  );
}

export function DetailsBody({ d, onRetry }: { d: CalendarEntryDetails; onRetry: () => void }) {
  const ba = birthAndAge(d.customer.birthDate);
  return (
    <div className="space-y-3">
      <Section title={d.kind === "booking" ? "Mietzeitraum & Buchung" : "Mietzeitraum"}>
        <Row label="Von">{fmtBerlinDateTime(new Date(d.startAt))}</Row>
        <Row label="Bis">{fmtBerlinDateTime(new Date(d.endAt))}</Row>
        <Row label="Fahrzeug">
          <Value v={[d.vehicleName, d.vehiclePlate].filter(Boolean).join(" · ") || null} />
        </Row>
        {d.booking && (
          <>
            <Row label="Tarif"><Value v={d.booking.planLabel} /></Row>
            <Row label="Status">
              <Value v={d.booking.status ? STATUS_LABELS[d.booking.status] ?? d.booking.status : null} />
            </Row>
            <Row label="Buchungsnummer">
              <span className="font-mono text-xs">{d.id}</span>
            </Row>
            {d.booking.planPrice !== null && <Row label="Mietpreis">{eur(d.booking.planPrice)}</Row>}
            {d.booking.discountCents ? (
              <Row label="Rabatt">
                − {eur(d.booking.discountCents / 100)}
                {d.booking.couponCode ? ` (${d.booking.couponCode})` : ""}
              </Row>
            ) : null}
            {d.booking.addons.length > 0 && (
              <Row label="Zusatzleistungen">
                {d.booking.addons.join(", ")}
                {d.booking.addonsTotalCents ? ` · ${eur(d.booking.addonsTotalCents / 100)}` : ""}
              </Row>
            )}
            {d.booking.deposit !== null && <Row label="Kaution">{eur(d.booking.deposit)}</Row>}
            {d.booking.freeKm !== null && (
              <Row label="Gebuchte Kilometer">
                {d.booking.freeKm.toLocaleString("de-DE")} km
                {d.booking.kmPriceCents !== null
                  ? ` · danach ${eur(d.booking.kmPriceCents / 100)}/km`
                  : ""}
              </Row>
            )}
          </>
        )}
      </Section>

      <Section title="Kundendaten">
        {d.kind === "booking" && !d.customer.profileLinked && (
          <p className="text-xs text-muted-foreground py-1">Kein Kundenprofil mit dieser Buchung verknüpft.</p>
        )}
        <Row label="Name"><Value v={d.customer.name} /></Row>
        {d.customer.companyName && <Row label="Firma">{d.customer.companyName}</Row>}
        <Row label="Telefon">
          {d.customer.phone ? (
            <a className="underline focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground rounded" href={`tel:${d.customer.phone.replace(/\s+/g, "")}`}>
              {d.customer.phone}
            </a>
          ) : (
            <Value v={null} />
          )}
        </Row>
        <Row label="E-Mail">
          {d.customer.email ? (
            <a className="underline focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground rounded" href={`mailto:${d.customer.email}`}>
              {d.customer.email}
            </a>
          ) : (
            <Value v={null} />
          )}
        </Row>
        <Row label="Geburtsdatum">{ba.birth === NOT_SET ? <Value v={null} /> : ba.birth}</Row>
        <Row label="Aktuelles Alter">{ba.age === NOT_SET ? <Value v={null} /> : ba.age}</Row>
        <Row label="Adresse"><Value v={d.customer.address} /></Row>
        {d.kind === "manual" && (
          <>
            <Row label="Ausweisnummer"><Value v={d.customer.idNumber} /></Row>
            <Row label="Führerscheinnr."><Value v={d.customer.licenseNumber} /></Row>
          </>
        )}
      </Section>

      <Section title="Hinweise">
        <p className="text-sm whitespace-pre-wrap break-words py-1">
          {d.notes ?? <span className="text-muted-foreground">{NO_NOTES}</span>}
        </p>
      </Section>

      <Section title="Führerschein & Ausweis">
        <div className="space-y-2 pt-1">
          <DocDisclosure title="Führerschein" pair={d.documents.license} onRetry={onRetry} />
          <DocDisclosure title="Ausweis" pair={d.documents.id} onRetry={onRetry} />
          {d.documents.others.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 min-w-0">
              {d.documents.others.map((o) => (
                <DocPreview key={o.id} onRetry={onRetry} side={o.originalName ? `Weiteres Dokument · ${o.originalName}` : "Weiteres Dokument"} doc={o} />
              ))}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

/** Lädt Details beim Öffnen frisch (neue signierte Links); verspätete Antworten werden verworfen. */
export function CalendarEntryDetailsPanel({ kind, id }: { kind: "booking" | "manual"; id: string }) {
  const fetchDetails = useServerFn(getCalendarEntryDetails);
  const [state, setState] = useState<
    { s: "loading" } | { s: "error"; msg: string } | { s: "ok"; d: CalendarEntryDetails }
  >({ s: "loading" });
  const reqRef = useRef(0);

  const load = useCallback(() => {
    const req = ++reqRef.current;
    setState({ s: "loading" });
    fetchDetails({ data: { kind, id } })
      .then((d) => {
        if (req !== reqRef.current) return;
        if (d.id !== id || d.kind !== kind) {
          setState({ s: "error", msg: "Antwort passt nicht zur gewählten Belegung." });
          return;
        }
        setState({ s: "ok", d });
      })
      .catch((e: unknown) => {
        if (req !== reqRef.current) return;
        const raw = e instanceof Error ? e.message : "";
        setState({
          s: "error",
          msg: /forbidden|unauthorized/i.test(raw)
            ? "Keine Berechtigung – bitte als Admin anmelden."
            : /Kundendaten/.test(raw)
              ? "Kundendaten konnten nicht geladen werden."
              : "Details konnten nicht geladen werden.",
        });
      });
  }, [fetchDetails, kind, id]);

  useEffect(() => {
    load();
    return () => {
      reqRef.current++; // Antworten nach dem Schließen verwerfen
    };
  }, [load]);

  if (state.s === "loading") {
    return <p role="status" className="text-sm text-muted-foreground py-2">Details werden geladen …</p>;
  }
  if (state.s === "error") {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 py-2 text-sm">
        <span>{state.msg}</span>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
        >
          <RotateCw className="w-3 h-3" /> Erneut laden
        </button>
      </div>
    );
  }
  return (
    <div>
      <DetailsBody d={state.d} onRetry={load} />
      <button
        type="button"
        onClick={load}
        className="mt-3 inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
      >
        <RotateCw className="w-3 h-3" /> Erneut laden
      </button>
    </div>
  );
}
