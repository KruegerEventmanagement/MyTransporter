"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STORAGE_KEY = "mt_availability_notice_dismissed";

export function AvailabilityNotice() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.sessionStorage.getItem(STORAGE_KEY) === "1";
    if (!dismissed) {
      setOpen(true);
    }
  }, []);

  const handleClose = () => {
    setOpen(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => next || setOpen(false)}>
      <DialogContent
        className="max-w-xl w-[calc(100%-2rem)] sm:w-full border-2 border-foreground bg-background p-6 sm:p-10 [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-4 text-center">
          <DialogTitle className="text-2xl sm:text-4xl font-bold leading-tight text-foreground">
            Aktuell keine Transporter verfügbar
          </DialogTitle>
          <DialogDescription className="text-base sm:text-lg text-muted-foreground leading-relaxed">
            Alle unsere Transporter sind leider bis zum 07.09.2026 vollständig vermietet.
            Eine Buchung ist daher derzeit nicht möglich.
            <br className="hidden sm:block" />
            <span className="block mt-3">
              Eventuell wird in 2–3 Wochen wieder Nachschub verfügbar sein.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6 sm:mt-8">
          <button
            type="button"
            onClick={handleClose}
            className="w-full rounded-full bg-foreground text-background py-3.5 text-base sm:text-lg font-semibold hover:opacity-90 transition-opacity"
          >
            Verstanden
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
