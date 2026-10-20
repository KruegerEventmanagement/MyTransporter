import { berlinWallToIso } from "@/lib/customer-mail-outbox.server";
import { KEY_CODE_LEAD_MS } from "@/lib/key-handover";

const ALLOWED = ["paid", "active", "in_progress", "picked_up"];

type Row = { user_id: string | null; status: string; start_date: string; start_hour: number } | null;

/** Reine Entscheidung: darf der Code jetzt an diesen Nutzer? */
export function pickupKeyDecision(
  b: Row,
  userId: string,
  now: number,
): { state: "due" } | { state: "locked"; unlockAt: string } | { state: "unavailable" } {
  if (!b || b.user_id !== userId || !ALLOWED.includes(b.status)) return { state: "unavailable" };
  const unlock = new Date(berlinWallToIso(b.start_date, b.start_hour)).getTime() - KEY_CODE_LEAD_MS;
  if (now < unlock) return { state: "locked", unlockAt: new Date(unlock).toISOString() };
  return { state: "due" };
}
