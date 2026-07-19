"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

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
    <DialogPrimitive.Root open={open} onOpenChange={(next) => next || setOpen(false)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/60 backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          onInteractOutside={(e) => e.preventDefault()}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border-2 border-foreground bg-background p-6 sm:p-10 shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="flex flex-col space-y-4 text-center">
            <DialogPrimitive.Title className="text-2xl sm:text-4xl font-bold leading-tight text-foreground">
              Aktuell keine Transporter verfügbar
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-base sm:text-lg text-muted-foreground leading-relaxed">
              Alle unsere Transporter sind leider bis zum 07.09.2026 vollständig vermietet.
              Eine Buchung ist daher derzeit nicht möglich.
              <span className="block mt-3">
                Eventuell wird in 2–3 Wochen wieder Nachschub verfügbar sein.
              </span>
            </DialogPrimitive.Description>
          </div>
          <div className="mt-6 sm:mt-8">
            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-full bg-foreground text-background py-3.5 text-base sm:text-lg font-semibold hover:opacity-90 transition-opacity"
            >
              Verstanden
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
