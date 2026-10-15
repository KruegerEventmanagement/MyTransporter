import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { returnPopupPhase, RETURN_NOTICE_FAST, RETURN_NOTICE_SLOW } from "@/lib/return-notice";

const key = (id: string, phase: string, endMs: number) => `mt_return_popup:${id}:${phase}:${endMs}`;

/** Pop-up ab 60 min vor Mietende und nach Ablauf, je Phase höchstens einmal. */
export function ReturnReminderDialog({ bookingId, endMs, returning }: { bookingId: string; endMs: number; returning: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const phase = returnPopupPhase(now, endMs, returning);
  useEffect(() => {
    if (!phase) return setOpen(false);
    try {
      if (localStorage.getItem(key(bookingId, phase, endMs))) return;
    } catch {
      /* ohne Speicher trotzdem zeigen */
    }
    setOpen(true);
  }, [phase, bookingId, endMs]);
  const close = () => {
    setOpen(false);
    if (phase) {
      try {
        localStorage.setItem(key(bookingId, phase, endMs), "1");
      } catch {
        /* ignore */
      }
    }
  };
  if (!phase) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent data-testid="return-reminder-dialog">
        <DialogHeader>
          <DialogTitle>{phase === "overdue" ? "Mietzeit abgelaufen – Rückgabe abschließen" : "Fahrzeug abgestellt? Jetzt Rückgabe abschließen"}</DialogTitle>
          <DialogDescription className="space-y-2 text-left">
            <span className="block">{RETURN_NOTICE_FAST}</span>
            <span className="block">{RETURN_NOTICE_SLOW}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={close} className="rounded-full border border-border px-5 py-2.5 text-sm">
            Später
          </button>
          <Link
            to="/trip/$bookingId"
            params={{ bookingId }}
            onClick={close}
            className="rounded-full bg-primary px-5 py-2.5 text-center text-sm font-semibold text-primary-foreground"
          >
            Zur Rückgabe mit Fotos
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
