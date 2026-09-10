INSERT INTO public.booking_actions (booking_id, action_key, status, attempts, succeeded_at)
SELECT a.booking_id, 'customer_invoice', 'succeeded', 1, now()
FROM public.booking_actions a
WHERE a.action_key = 'customer_confirmation_invoice' AND a.status = 'succeeded'
ON CONFLICT (booking_id, action_key) DO NOTHING;