CREATE TABLE public.mail_bounces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dsn_message_id text NOT NULL UNIQUE,
  original_thread_id text,
  outbox_id uuid,
  mail_kind text,
  source_type text,
  source_id uuid,
  recipient_email text,
  smtp_status text,
  diagnostic text,
  permanent boolean NOT NULL DEFAULT true,
  bounced_at timestamptz,
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mail_bounces TO authenticated;
GRANT ALL ON public.mail_bounces TO service_role;
ALTER TABLE public.mail_bounces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read mail bounces" ON public.mail_bounces FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX mail_bounces_source_idx ON public.mail_bounces (source_id);