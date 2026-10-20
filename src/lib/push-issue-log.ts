/**
 * Protokolliert Push-Fehler höchstens einmal je Grund in PUSH_ISSUE_THROTTLE_MS.
 * Push-Fehlereinträge lösen selbst nie einen Push aus (siehe trigger_admin_push
 * und notify-admin), damit keine Endlosschleife entsteht.
 */
export const PUSH_ISSUE_THROTTLE_MS = 6 * 60 * 60 * 1000;
export const PUSH_FAILED_TYPE = "push_failed";

export type PushIssueStore = {
  recentExists: (title: string, sinceIso: string) => Promise<boolean>;
  insert: (row: { type: string; title: string; body: string }) => Promise<void>;
};

export async function logPushIssueThrottled(
  store: PushIssueStore,
  reason: string,
  body: string,
  now: Date = new Date(),
): Promise<boolean> {
  const title = `Push nicht zugestellt (${reason})`;
  try {
    const since = new Date(now.getTime() - PUSH_ISSUE_THROTTLE_MS).toISOString();
    if (await store.recentExists(title, since)) return false;
    await store.insert({ type: PUSH_FAILED_TYPE, title, body });
    return true;
  } catch {
    return false;
  }
}

/** Typen, die nie selbst einen Push oder ein Pop-up auslösen. */
export function isSilentAdminNotification(type: string | null | undefined): boolean {
  return type === PUSH_FAILED_TYPE;
}
