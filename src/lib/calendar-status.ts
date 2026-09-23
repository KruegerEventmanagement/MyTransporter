/** Reine Auswertung des Kalenderstatus (ohne Kundendaten, ohne rohe Fehlertexte). */

export type CalendarStateRow = {
  version: number | string;
  synced_version: number | string;
  synced_at: string | null;
  last_error: string | null;
  updated_at: string;
};

export type CalendarSyncStatus = {
  /** Nur: Zugangsdaten sind im Server hinterlegt. KEIN Beweis einer funktionierenden Verbindung. */
  credentialsConfigured: boolean;
  pending: number;
  failed: number;
  total: number;
  lastSuccessAt: string | null;
  /** Sichere, generische Fehlerklasse (z. B. "HTTP 403", "Nicht verbunden"). */
  lastErrorClass: string | null;
};

export type CalendarStatusView = {
  headline: string;
  tone: "ok" | "warn";
  hint: string | null;
};

/** Reduziert einen gespeicherten Fehlertext auf eine sichere Klasse ohne Response-Body. */
export function safeErrorClass(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const http = raw.match(/\[(\d{3})\]/);
  if (http) return `HTTP ${http[1]}`;
  if (/nicht verbunden|GOOGLE_CALENDAR_API_KEY/i.test(raw)) return "Nicht verbunden";
  if (/abort|timeout/i.test(raw)) return "Zeitüberschreitung";
  if (/lease/i.test(raw)) return "Parallele Verarbeitung";
  return "Unbekannter Fehler";
}

export function summarizeCalendarState(rows: CalendarStateRow[], credentialsConfigured: boolean): CalendarSyncStatus {
  let pending = 0;
  let failed = 0;
  let lastSuccessAt: string | null = null;
  let lastErr: string | null = null;
  let lastErrAt = "";
  for (const r of rows) {
    const open = Number(r.synced_version) < Number(r.version);
    if (open) pending++;
    if (open && r.last_error) {
      failed++;
      if (r.updated_at > lastErrAt) {
        lastErrAt = r.updated_at;
        lastErr = r.last_error;
      }
    }
    if (r.synced_at && (!lastSuccessAt || r.synced_at > lastSuccessAt)) lastSuccessAt = r.synced_at;
  }
  return { credentialsConfigured, pending, failed, total: rows.length, lastSuccessAt, lastErrorClass: safeErrorClass(lastErr) };
}

/** Anzeige: "Verbunden" wird nie behauptet – es findet keine Live-Prüfung des Zielkalenders statt. */
export function calendarStatusView(s: CalendarSyncStatus): CalendarStatusView {
  const conn = s.credentialsConfigured ? "Zugang eingerichtet, Verbindung noch nicht geprüft" : "Nicht verbunden";
  const parts = [`Google-Kalender info@mytransporter.org: ${conn}`, `${s.pending} ausstehend`];
  if (s.failed > 0) parts.push(`${s.failed} mit Fehler`);
  const tone = s.credentialsConfigured && s.pending === 0 && s.failed === 0 ? "ok" : "warn";
  let hint: string | null = null;
  if (!s.credentialsConfigured) {
    hint = "Termine werden gespeichert, aber nicht in den Google-Kalender übertragen. Verbindung unter „Connectors → Google Calendar“ mit info@mytransporter.org herstellen.";
  } else if (s.pending > 0) {
    hint = `${s.pending} Termin(e) noch nicht im Google-Kalender übertragen.`;
  }
  return { headline: parts.join(" · "), tone, hint };
}
