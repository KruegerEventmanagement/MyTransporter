CREATE TABLE IF NOT EXISTS public.native_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  platform text NOT NULL CHECK (platform IN ('ios','android')),
  provider text NOT NULL CHECK (provider IN ('apns','fcm')),
  app_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS native_push_tokens_user_idx ON public.native_push_tokens(user_id);
ALTER TABLE public.native_push_tokens ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.native_push_tokens TO authenticated;
GRANT ALL ON public.native_push_tokens TO service_role;
CREATE POLICY "own native tokens select" ON public.native_push_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own native tokens insert" ON public.native_push_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own native tokens update" ON public.native_push_tokens FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own native tokens delete" ON public.native_push_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);