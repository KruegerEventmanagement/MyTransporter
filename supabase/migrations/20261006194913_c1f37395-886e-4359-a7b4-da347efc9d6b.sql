CREATE TABLE public.mail_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  request_id uuid NOT NULL UNIQUE,
  test_id text NOT NULL,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','accepted','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mail_test_runs_admin_idx ON public.mail_test_runs(admin_id, created_at DESC);
GRANT SELECT ON public.mail_test_runs TO authenticated;
GRANT ALL ON public.mail_test_runs TO service_role;
ALTER TABLE public.mail_test_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view mail test runs" ON public.mail_test_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));