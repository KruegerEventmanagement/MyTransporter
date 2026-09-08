import { Fuel } from "lucide-react";

/**
 * Kompakter, positiver Hinweis darauf, dass Kraftstoff nicht in den
 * Freikilometern enthalten ist. Rein visuell/textlich – keine Business-Logik.
 *
 * `freeKm` ist optional: falls die aufrufende Ansicht die Anzahl der im
 * gewählten Tarif enthaltenen Kilometer kennt, wird sie dynamisch eingesetzt;
 * andernfalls erscheint der allgemeine Begriff „enthaltene Freikilometer“.
 */
export function FuelInfoNote({ freeKm, className = "" }: { freeKm?: number; className?: string }) {
  const kmText =
    typeof freeKm === "number" && freeKm > 0
      ? `${freeKm.toLocaleString("de-DE")} km`
      : "die enthaltenen Freikilometer";
  return (
    <div className={`mt-4 p-4 rounded-xl bg-secondary text-left ${className}`}>
      <div className="flex items-start gap-3">
        <Fuel className="w-5 h-5 mt-0.5 flex-shrink-0 text-foreground" />
        <div className="space-y-2">
          <p className="text-sm font-bold text-foreground">Du zahlst nur, was du verbrauchst</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Der Transporter wird dir mit einem dokumentierten Tankstand übergeben – in der Regel
            vollgetankt. Bitte bring ihn einfach mit demselben Tankstand zurück. Kraftstoff zahlst
            du damit nur für deinen eigenen Verbrauch.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {kmText} aus dem gewählten Tarif sind inklusive. Erst bei zusätzlichen Kilometern über
            dem Freikilometer-Kontingent fallen die jeweiligen Mehrkilometerkosten an. Kraftstoff
            ist unabhängig davon selbst zu tragen.
          </p>
        </div>
      </div>
    </div>
  );
}
