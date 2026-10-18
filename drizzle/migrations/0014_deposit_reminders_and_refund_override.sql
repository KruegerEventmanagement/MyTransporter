ALTER TABLE public.deposit_reviews
  ADD COLUMN IF NOT EXISTS refund_override_cents integer,
  ADD COLUMN IF NOT EXISTS adjustment_reason text,
  ADD COLUMN IF NOT EXISTS send_closing_mail boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.deposit_reviews.refund_override_cents IS 'Vom Admin frei bestaetigter Rueckzahlungsbetrag in Cent; null = Vorschlag aus Positionen';
COMMENT ON COLUMN public.deposit_reviews.adjustment_reason IS 'Pflichtbegruendung, wenn refund_override_cents vom Vorschlag abweicht (Kulanz oder zusaetzlicher Abzug)';
COMMENT ON COLUMN public.deposit_reviews.send_closing_mail IS 'Admin-Wahl: Kundenmail nach Abschluss senden (Standard false = keine Mail)';

CREATE TABLE public.deposit_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  end_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id, end_version)
);
COMMENT ON TABLE public.deposit_reminders IS 'Dedupe fuer die 48h-Kautionserinnerung: genau eine Erinnerung je Quelle und Mietende-Version';
GRANT ALL ON public.deposit_reminders TO service_role;
ALTER TABLE public.deposit_reminders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_mail_settings ADD COLUMN IF NOT EXISTS deposit_reminder_from timestamptz;
COMMENT ON COLUMN public.customer_mail_settings.deposit_reminder_from IS 'Aktivierungszeitpunkt der 48h-Kautionserinnerungen; keine rueckwirkenden Erinnerungen vor diesem Zeitpunkt';
UPDATE public.customer_mail_settings SET deposit_reminder_from = now() WHERE id = true AND deposit_reminder_from IS NULL;