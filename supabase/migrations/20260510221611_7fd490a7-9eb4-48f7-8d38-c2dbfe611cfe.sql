-- 1. Admin-Rolle für krueger.christian96@gmx.de zuweisen (falls Account existiert)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'krueger.christian96@gmx.de'
ON CONFLICT DO NOTHING;

-- 2. Kautionsstatus zu Buchungen hinzufügen
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS deposit_status TEXT NOT NULL DEFAULT 'held',
  ADD COLUMN IF NOT EXISTS deposit_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deposit_released_by UUID;

-- 3. Admin-Benachrichtigungen Tabelle
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  booking_id UUID,
  user_id UUID,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view notifications"
  ON public.admin_notifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update notifications"
  ON public.admin_notifications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Authentifizierte Nutzer dürfen Benachrichtigungen für Admins erzeugen
-- (z.B. wenn ihre Buchung aktiv wird oder Fotos hochgeladen werden)
CREATE POLICY "Authenticated users can create notifications"
  ON public.admin_notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at
  ON public.admin_notifications (created_at DESC);

-- 4. Realtime aktivieren für Live-Updates im Admin-Bereich
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_photos;