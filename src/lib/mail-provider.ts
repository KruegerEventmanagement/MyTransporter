/** Browser-safe types only; implementations are server-only. */
export type MailSendArgs = {
  from: string; to: string; replyTo?: string; subject: string; html: string; text?: string;
  attachments?: { filename: string; content: string }[]; headers?: Record<string, string>;
  provider?: "resend" | "gmail";
  idempotencyKey: string; timeoutMs?: number; fetchImpl?: typeof fetch;
};
export type ResendErrorKind =
  | "invalid_key"
  | "restricted_key"
  | "sender_domain"
  | "transient"
  | "idempotency_in_progress"
  | "idempotency_mismatch"
  | "other";

export type DetailedSendResult =
  | { ok: true; providerId: string }
  | {
      ok: false;
      kind: ResendErrorKind | "missing_key" | "timeout" | "network" | "no_provider_id" | "provider_not_ready";
      /** true = unklar, ob der Anbieter die Mail angenommen hat. */
      ambiguous: boolean;
      status: number | null;
      error: string;
    };


export type MailProvider = {
  id: "resend" | "gmail";
  supportsProviderIdempotency: boolean;
  send: (args: MailSendArgs) => Promise<DetailedSendResult>;
};
