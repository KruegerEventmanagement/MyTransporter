// TEMPORÄR für lokale QA – wird nach dem Test wieder entfernt.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DetailsBody } from "@/components/admin/CalendarEntryDetails";
import { fmtBerlinDateTime } from "@/lib/calendar-details";

const img = (t: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='856' height='540'><rect width='100%' height='100%' fill='#ddd'/><text x='40' y='280' font-size='48'>${t}</text></svg>`)}`;
const doc = (id: string, t: string, extra: object = {}) => ({
  id, docType: id, label: t, signedUrl: img(t), fileState: "ok" as const, isPdf: false, removedByUser: false, originalName: null, ...extra,
});
const d = {
  kind: "booking" as const, id: "00000000-0000-4000-8000-000000000001",
  startAt: "2026-10-09T14:00:00Z", endAt: "2026-10-11T14:00:00Z",
  vehicleName: "Citroën Jumper L4H2", vehiclePlate: "TEST QA 1",
  booking: { planLabel: "2 Tage", status: "paid", planPrice: 189, deposit: 200, discountCents: 0, addonsTotalCents: 900,
    addons: ["Sackkarre"], freeKm: 400, kmPriceCents: 45, couponCode: null, createdAt: null },
  customer: { name: "Erika Testfrau", phone: "+49 170 0000000", email: "erika.testfrau.sehr.lange.adresse@example.invalid",
    birthDate: "1990-10-06", address: "Teststraße 12, 12345 Musterstadt, Deutschland", companyName: null,
    idNumber: null, licenseNumber: null, profileLinked: true },
  notes: "Bitte Spanngurte bereitlegen.",
  documents: {
    license: { front: doc("license_front", "FS vorne"), back: doc("license_back", "FS hinten", { signedUrl: null, fileState: "unavailable" }) },
    id: { front: doc("id_front", "Ausweis vorne"), back: null },
    others: [doc("other", "PDF", { isPdf: true, originalName: "ein-sehr-langer-dateiname-ohne-leerzeichen-".repeat(4) + ".pdf" })],
  },
};

export const Route = createFileRoute("/qa-calendar-preview")({ component: Preview });

function Preview() {
  const [open, setOpen] = useState(false);
  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="font-semibold">{d.vehicleName} · {d.vehiclePlate}</p>
        <p className="text-sm">{d.customer.name}</p>
        <p className="text-xs mt-1">Von: {fmtBerlinDateTime(new Date(d.startAt))}</p>
        <p className="text-xs">Bis: {fmtBerlinDateTime(new Date(d.endAt))}</p>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
          className="mt-3 rounded-full bg-foreground text-background px-3 py-1.5 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2">
          {open ? "Details schließen" : "Buchungsdetails anzeigen"}
        </button>
        {open && <div className="mt-3 border-t border-border pt-3"><DetailsBody d={d} onRetry={() => {}} /></div>}
      </div>
    </div>
  );
}
