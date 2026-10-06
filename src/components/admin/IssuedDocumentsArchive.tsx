import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, RefreshCw, X } from "lucide-react";
import { getIssuedDocument, listIssuedDocuments } from "@/lib/admin-documents.functions";
import { fmtEurC } from "@/lib/doc-totals";

type Row = Awaited<ReturnType<typeof listIssuedDocuments>>[number];
type Detail = Awaited<ReturnType<typeof getIssuedDocument>>;

const inputCls =
  "w-full rounded-xl bg-secondary px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-foreground";

const statusLabel = (s: string | null) =>
  s === "paid" ? "Bezahlt" : s === "open" ? "Offen" : "—";

export function IssuedDocumentsArchive() {
  const list = useServerFn(listIssuedDocuments);
  const get = useServerFn(getIssuedDocument);
  const [kind, setKind] = useState<"all" | "invoice" | "offer">("all");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await list({ data: { kind, q } }));
    } catch {
      toast.error("Belege konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [list, kind, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function open(id: string) {
    try {
      setDetail(await get({ data: { id } }));
    } catch {
      toast.error("Beleg konnte nicht geöffnet werden");
    }
  }

  return (
    <section className="p-4 rounded-2xl bg-card border border-border space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Belegarchiv</h3>
        <button onClick={load} className="p-2 rounded-full bg-secondary" aria-label="Aktualisieren">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-2">
          {(["all", "invoice", "offer"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${kind === k ? "bg-foreground text-background" : "bg-secondary"}`}
            >
              {k === "all" ? "Alle" : k === "invoice" ? "Rechnungen" : "Angebote"}
            </button>
          ))}
        </div>
        <input
          className={inputCls}
          placeholder="Nummer, Kunde, E-Mail oder Buchungs-ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          {loading ? "Lädt…" : "Noch keine archivierten Belege. Die Speicherung gilt ab sofort für alle neuen Belege."}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => open(r.id)}
              className="w-full text-left py-3 flex items-center gap-3 hover:bg-secondary/50 rounded-lg px-2"
            >
              <FileText className="w-4 h-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {r.kind === "invoice" ? "Rechnung" : "Angebot"} {r.document_number}
                  {r.revision > 1 ? ` · Rev. ${r.revision}` : ""}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {new Date(r.created_at).toLocaleString("de-DE")} ·{" "}
                  {r.customer_company || r.customer_name || r.customer_email || "ohne Kunde"}
                  {r.booking_id ? ` · Buchung ${r.booking_id.slice(0, 8)}` : ""}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold">{fmtEurC(r.total_cents)}</div>
                <div className="text-xs text-muted-foreground">{statusLabel(r.payment_status)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div
            className="bg-background rounded-2xl max-w-lg w-full max-h-[85vh] overflow-auto p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h4 className="font-semibold">
                {detail.doc.kind === "invoice" ? "Rechnung" : "Angebot"} {detail.doc.document_number}
              </h4>
              <button onClick={() => setDetail(null)} aria-label="Schließen">
                <X className="w-5 h-5" />
              </button>
            </div>
            <dl className="text-sm grid grid-cols-2 gap-y-1">
              <dt className="text-muted-foreground">Datum</dt>
              <dd>{new Date(detail.doc.document_date).toLocaleDateString("de-DE")}</dd>
              <dt className="text-muted-foreground">Erstellt</dt>
              <dd>{new Date(detail.doc.created_at).toLocaleString("de-DE")}</dd>
              <dt className="text-muted-foreground">Kunde</dt>
              <dd>{[detail.doc.customer_company, detail.doc.customer_name].filter(Boolean).join(" · ") || "—"}</dd>
              <dt className="text-muted-foreground">E-Mail</dt>
              <dd className="break-all">{detail.doc.customer_email || "—"}</dd>
              <dt className="text-muted-foreground">Buchung</dt>
              <dd className="break-all">{detail.doc.booking_id || "—"}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{statusLabel(detail.doc.payment_status)}</dd>
            </dl>
            <div className="border-t border-border pt-2 text-sm space-y-1">
              {(detail.doc.items as { label: string; gross_cents: number }[]).map((it, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span>{it.label}</span>
                  <span>{fmtEurC(it.gross_cents)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-2 text-sm space-y-1">
              <div className="flex justify-between"><span>Netto</span><span>{fmtEurC(detail.doc.net_cents)}</span></div>
              <div className="flex justify-between">
                <span>USt. {Math.round(Number(detail.doc.vat_rate) * 100)} %</span>
                <span>{fmtEurC(detail.doc.vat_cents)}</span>
              </div>
              <div className="flex justify-between"><span>Brutto Leistung</span><span>{fmtEurC(detail.doc.gross_cents)}</span></div>
              {detail.doc.non_taxable_cents !== 0 && (
                <div className="flex justify-between"><span>Ohne USt. (Kaution)</span><span>{fmtEurC(detail.doc.non_taxable_cents)}</span></div>
              )}
              <div className="flex justify-between font-semibold"><span>Gesamt</span><span>{fmtEurC(detail.doc.total_cents)}</span></div>
            </div>
            {detail.pdfUrl ? (
              <a
                href={detail.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="block text-center rounded-full bg-foreground text-background py-2.5 font-medium"
              >
                PDF öffnen / herunterladen
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">PDF-Link konnte nicht erstellt werden.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
