import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  POST_PAYMENT_PHOTO_NOTICE,
  POST_PAYMENT_PHOTO_TITLE,
  RETURN_PHOTO_LIST,
  postPaymentNoticeKey,
  shouldShowPostPaymentNotice,
} from "@/lib/return-notice";

/** Einmaliges Pop-up je Buchung direkt nach der Zahlung. */
export function PostPaymentPhotoNotice({ bookingId, fromCheckout }: { bookingId: string; fromCheckout: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(postPaymentNoticeKey(bookingId)) === "1"; } catch {}
    setOpen(shouldShowPostPaymentNotice(fromCheckout, seen));
  }, [bookingId, fromCheckout]);
  const close = () => {
    try { localStorage.setItem(postPaymentNoticeKey(bookingId), "1"); } catch {}
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md border-2 border-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Camera className="h-5 w-5" aria-hidden /> {POST_PAYMENT_PHOTO_TITLE}
          </DialogTitle>
          <DialogDescription className="text-base font-semibold text-foreground">{POST_PAYMENT_PHOTO_NOTICE}</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
          {RETURN_PHOTO_LIST.map((p) => <li key={p}>{p}</li>)}
        </ul>
        <button type="button" onClick={close} className="mt-2 w-full rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground">
          Verstanden
        </button>
      </DialogContent>
    </Dialog>
  );
}
