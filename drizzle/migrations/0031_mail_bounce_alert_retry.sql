ALTER TABLE public.mail_bounces ADD COLUMN IF NOT EXISTS alert_due boolean NOT NULL DEFAULT false;
ALTER TABLE public.mail_bounces ADD COLUMN IF NOT EXISTS alert_notification_id uuid;
ALTER TABLE public.mail_bounces ADD COLUMN IF NOT EXISTS alert_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.mail_bounces ADD COLUMN IF NOT EXISTS alert_last_error text;
-- Bestandszeilen: notified=true bedeutete bisher nur "Alarm beabsichtigt"; als fällig übernehmen, Zustellung bleibt offen markiert.
UPDATE public.mail_bounces SET alert_due = true WHERE notified AND alert_notification_id IS NULL;
CREATE INDEX IF NOT EXISTS mail_bounces_alert_pending_idx ON public.mail_bounces (created_at) WHERE alert_due AND alert_notification_id IS NULL;

-- Atomar: Meldung anlegen + Bounce als gemeldet markieren in einer Transaktion; Zeilensperre verhindert Doppelalarm paralleler Läufe.
CREATE OR REPLACE FUNCTION public.deliver_mail_bounce_alert(p_bounce_id uuid, p_title text, p_body text, p_booking_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.mail_bounces%ROWTYPE; nid uuid;
BEGIN
  SELECT * INTO r FROM public.mail_bounces WHERE id = p_bounce_id FOR UPDATE;
  IF NOT FOUND OR NOT r.alert_due OR r.alert_notification_id IS NOT NULL THEN RETURN NULL; END IF;
  INSERT INTO public.admin_notifications (type, title, body, booking_id)
  VALUES ('mail_bounce', p_title, p_body, p_booking_id) RETURNING id INTO nid;
  UPDATE public.mail_bounces SET alert_notification_id = nid, notified = true, alert_last_error = null WHERE id = p_bounce_id;
  RETURN nid;
END $$;
REVOKE ALL ON FUNCTION public.deliver_mail_bounce_alert(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_mail_bounce_alert(uuid, text, text, uuid) TO service_role;