import { Camera } from "lucide-react";
import { RETURN_NOTICE_TITLE, RETURN_NOTICE_FAST, RETURN_NOTICE_SLOW, DEPOSIT_BANK_NOTE, POST_PAYMENT_PHOTO_HEADLINE } from "@/lib/return-notice";

/** Hinweis: Fahrt mit Pflichtfotos beenden ⇒ Kaution schneller, keine Pauschale. */
export function DepositReturnNotice({ className = "" }: { className?: string }) {
  return (
    <div role="note" data-testid="deposit-return-notice" className={`rounded-2xl border-2 border-foreground bg-secondary p-4 text-left text-sm leading-relaxed text-foreground ${className}`}>
      <p className="mb-2 text-base font-bold">{POST_PAYMENT_PHOTO_HEADLINE}</p>
      <p className="flex items-center gap-2 font-semibold">
        <Camera className="h-4 w-4" aria-hidden /> {RETURN_NOTICE_TITLE}
      </p>
      <p className="mt-2">{RETURN_NOTICE_FAST}</p>
      <p className="mt-2">{RETURN_NOTICE_SLOW}</p>
      <p className="mt-2 text-muted-foreground">{DEPOSIT_BANK_NOTE}</p>
    </div>
  );
}
