import type { MailSendArgs, DetailedSendResult, ResendErrorKind } from "@/lib/mail-provider";
/** Ordnet einen Resend-Fehler anhand von name/message ein – nicht pauschal nach Status. */
export function classifyResendError(
  status: number,
  bodyText: string,
): { kind: ResendErrorKind; hint: string | null } {
  let name = "";
  let message = "";
  try {
    const j = JSON.parse(bodyText) as { name?: unknown; message?: unknown };
    name = typeof j.name === "string" ? j.name.toLowerCase() : "";
    message = typeof j.message === "string" ? j.message.toLowerCase() : "";
  } catch {
    message = bodyText.toLowerCase();
  }
  // 409: gleicher Schlüssel läuft noch (sicher später erneut) vs. Schlüssel mit anderem Inhalt
  // bereits benutzt (früherer Versuch evtl. angenommen ⇒ nie blind neu senden).
  if (name === "concurrent_idempotent_requests") {
    return { kind: "idempotency_in_progress", hint: "Gleicher Versand läuft noch beim Mailanbieter" };
  }
  if (name === "invalid_idempotent_request") {
    return { kind: "idempotency_mismatch", hint: "Versandschlüssel bereits mit anderem Inhalt benutzt – Prüfung nötig" };
  }
  if (name === "invalid_api_key" || /api key is invalid/.test(message)) {
    return { kind: "invalid_key", hint: "Mail-Zugang abgelehnt (Schlüssel ungültig) – RESEND_API_KEY prüfen/ersetzen" };
  }
  if (/quota|daily.*limit|monthly.*limit|billing|payment.required|credits.*exhaust/.test(`${name} ${message}`)) {
    return { kind: "other", hint: "Mailanbieter meldet ein Versandlimit oder Zahlungsproblem – Konto prüfen" };
  }
  if (name === "restricted_api_key" || /restricted to only send|restricted api key/.test(message)) {
    return { kind: "restricted_key", hint: "Mail-Schlüssel ohne nötige Berechtigung – Schlüsselrechte in Resend prüfen" };
  }
  if (
    /domain is not verified|not verified|verify a domain|testing emails|own email address|invalid_from_address/.test(
      `${name} ${message}`,
    )
  ) {
    return { kind: "sender_domain", hint: "Absender/Domain in Resend nicht freigegeben – Domain-Verifizierung prüfen (kein Schlüsselproblem)" };
  }
  if (status === 429 || status >= 500) {
    return { kind: "transient", hint: "Vorübergehende Störung beim Mailanbieter; Versand nicht erfolgt." };
  }
  return { kind: "other", hint: null };
}

/** Entfernt mögliche Schlüssel (re_…/Bearer …) aus Fehlertexten. */
export function redactSecrets(s: string): string {
  return s.replace(/re_[A-Za-z0-9_]{8,}/g, "re_***").replace(/Bearer\s+\S+/gi, "Bearer ***");
}

/**
 * Versand mit belastbarer Rückmeldung: Erfolg NUR bei 2xx UND Provider-ID.
 * Keine Admin-Protokollierung hier – der Aufrufer verfolgt den Status selbst.
 */
export async function sendViaResend(args: MailSendArgs): Promise<DetailedSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, kind: "missing_key", ambiguous: false, status: null, error: "RESEND_API_KEY fehlt" };
  }
  const f = args.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 15_000);
  try {
    const body: Record<string, unknown> = {
      from: args.from,
      to: args.to,
      subject: args.subject,
      html: args.html,
    };
    if (args.text) body.text = args.text;
    if (args.replyTo) body.reply_to = args.replyTo;
    if (args.attachments && args.attachments.length > 0) body.attachments = args.attachments;
    if (args.headers && Object.keys(args.headers).length > 0) body.headers = args.headers;
    const res = await f("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": args.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    if (!res.ok) {
      const cls = classifyResendError(res.status, raw);
      return {
        ok: false,
        kind: cls.kind,
        // 5xx: Annahme durch den Anbieter ist nicht ausgeschlossen.
        ambiguous: res.status >= 500 || cls.kind === "idempotency_in_progress" || cls.kind === "idempotency_mismatch",
        status: res.status,
        error: `${cls.hint ?? "Versand abgelehnt"} · ${res.status} · ${redactSecrets(raw).slice(0, 300)}`,
      };
    }
    let id = "";
    try {
      const v = (JSON.parse(raw) as { id?: unknown }).id;
      if (typeof v === "string" && v.trim()) id = v.trim();
    } catch {
      /* leer */
    }
    if (!id) {
      return { ok: false, kind: "no_provider_id", ambiguous: true, status: res.status, error: "Antwort ohne Versand-ID" };
    }
    return { ok: true, providerId: id };
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    return {
      ok: false,
      kind: aborted ? "timeout" : "network",
      ambiguous: true,
      status: null,
      error: aborted ? "Zeitüberschreitung beim Mailanbieter" : redactSecrets(String((e as Error)?.message ?? e)).slice(0, 300),
    };
  } finally {
    clearTimeout(timer);
  }
}

