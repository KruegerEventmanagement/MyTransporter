-- Server mail eligibility must check the same active-account rule as clients.
-- This grants the existing read-only guard, without changing its privacy logic.
GRANT EXECUTE ON FUNCTION public.is_account_active(uuid) TO service_role;