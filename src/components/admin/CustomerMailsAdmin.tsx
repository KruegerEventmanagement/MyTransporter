import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listCustomerMails, retryCustomerMail, saveReviewLink } from "@/lib/customer-mails.functions";
import { outboxStatusLabel } from "@/lib/customer-mail-outbox";

type Row = {
  id: string;
  source_type: string;
  source_id: string;
  kind: string;
  status: string;
  due_at: string;
  recipient_email: string | null;
  attempts: number;
  ambiguous: boolean;
  last_error: string | null;
  blocked_reason: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" }) : "–";
const KIND: Record<string, string> = { invoice: "Rechnung (PDF)", review_request: "Bewertungsanfrage" };

function MailRow({ r, onRetry }: { r: Row; onRetry: (r: Row) => void }) {
  const canRetry = r.status === "failed" || r.status === "needs_review";
  return (
    <li className="rounded-xl border border-border p-3 text-xs space-y-1">
      <div className="flex justify-between gap-2">
        <span className="font-semibold">{KIND[r.kind] ?? r.kind}</span>
        <span className={r.status === "sent" ? "font-semibold" : r.status === "needs_review" || r.status === "failed" ? "text-destructive font-semibold" : "text-muted-foreground"}>
          {outboxStatusLabel(r.status, r.ambiguous)}
        </span>
      </div>
      <p className="text-muted-foreground">
        {r.status === "sent" ? `Angenommen ${fmt(r.sent_at)}` : `Fällig ${fmt(r.due_at)}`} · Versuche {r.attempts}
        {r.provider_message_id ? ` · Versand-ID ${r.provider_message_id}` : ""}
      </p>
      {(r.last_error || r.blocked_reason) && <p className="text-muted-foreground break-words">{r.blocked_reason ?? r.last_error}</p>}
      {canRetry && (
        <button type="button" onClick={() => onRetry(r)} className="rounded-full bg-foreground text-background px-3 py-1 font-semibold">
          {r.status === "needs_review" || r.ambiguous ? "Geprüft – erneut senden" : "Erneut senden"}
        </button>
      )}
    </li>
  );
}

function useMails(sourceId?: string) {
  const list = useServerFn(listCustomerMails);
  const retry = useServerFn(retryCustomerMail);
  const [data, setData] = useState<{ rows: Row[]; settings: { google_review_url: string | null; review_requests_from: string | null } | null } | null>(null);
  const load = useCallback(() => {
    list({ data: { sourceId } }).then((d) => setData(d as never)).catch((e) => toast.error(String(e?.message ?? e)));
  }, [list, sourceId]);
  useEffect(load, [load]);
  const onRetry = async (r: Row) => {
    const unclear = r.status === "needs_review" || r.ambiguous;
    if (unclear && !window.confirm("Ergebnis war unklar. Hast du beim Mailanbieter geprüft, dass diese Mail NICHT versendet wurde?")) return;
    try {
      const out = await retry({ data: { id: r.id, confirmChecked: unclear } });
      toast.message(`Ergebnis: ${(out as { status: string }).status}`);
    } catch (e) {
      toast.error(String((e as Error)?.message ?? e));
    }
    load();
  };
  return { data, load, onRetry };
}

/** Kompakter Status je Buchung (Rechnung/Bewertungsanfrage). */
export function BookingMailStatus({ sourceId }: { sourceId: string }) {
  const { data, onRetry } = useMails(sourceId);
  if (!data) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kunden-Mails</p>
      {data.rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Keine Rechnung/Bewertungsanfrage geplant.</p>
      ) : (
        <ul className="space-y-1">{data.rows.map((r) => <MailRow key={r.id} r={r} onRetry={onRetry} />)}</ul>
      )}
    </div>
  );
}

export function CustomerMailsAdmin() {
  const { data, load, onRetry } = useMails();
  const save = useServerFn(saveReviewLink);
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(data?.settings?.google_review_url ?? ""), [data?.settings?.google_review_url]);
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Kunden-Mails</h2>
      <div className="rounded-2xl border border-border p-4 space-y-2">
        <p className="text-sm font-semibold">Google-Bewertungslink</p>
        {!data?.settings?.google_review_url && (
          <p className="text-xs text-destructive">
            Kein Bewertungslink hinterlegt – Bewertungsanfragen sind gesperrt. Füge den Link „Bewertung anfordern“ aus deinem Google-Unternehmensprofil ein.
          </p>
        )}
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://g.page/r/…/review" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        <button
          type="button"
          className="rounded-full bg-foreground text-background px-4 py-2 text-sm font-semibold"
          onClick={async () => {
            try {
              await save({ data: { url } });
              toast.success("Gespeichert");
              load();
            } catch (e) {
              toast.error(String((e as Error)?.message ?? e));
            }
          }}
        >
          Speichern
        </button>
        {data?.settings?.review_requests_from && (
          <p className="text-xs text-muted-foreground">Bewertungsanfragen für Buchungen ab {fmt(data.settings.review_requests_from)}, jeweils 24 Stunden nach der Buchung.</p>
        )}
        <p className="text-xs text-muted-foreground">„Angenommen“ heißt: der Mailanbieter hat die Mail übernommen – nicht, dass sie zugestellt wurde.</p>
      </div>
      <ul className="space-y-2">{(data?.rows ?? []).map((r) => <MailRow key={r.id} r={r} onRetry={onRetry} />)}</ul>
    </section>
  );
}
