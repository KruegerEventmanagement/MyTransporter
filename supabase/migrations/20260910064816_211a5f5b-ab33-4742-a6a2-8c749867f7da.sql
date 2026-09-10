ALTER TABLE public.booking_actions DROP CONSTRAINT IF EXISTS booking_actions_key_chk;
ALTER TABLE public.booking_actions ADD CONSTRAINT booking_actions_key_chk CHECK (
  action_key = ANY (ARRAY[
    'new_booking_notification'::text,
    'customer_confirmation_invoice'::text,
    'customer_invoice'::text,
    'admin_booking_email'::text,
    'admin_push'::text
  ])
);

INSERT INTO public.booking_actions (booking_id, action_key, status, attempts, succeeded_at)
SELECT DISTINCT b.id, 'customer_invoice', 'succeeded', 1, now()
FROM public.bookings b
WHERE EXISTS (
  SELECT 1 FROM public.admin_notifications n
  WHERE n.booking_id = b.id AND n.title = 'Buchungsbestätigung versendet'
)
ON CONFLICT (booking_id, action_key) DO NOTHING;