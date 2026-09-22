import { describe, expect, it } from "vitest";
import type { BusySlot } from "@/lib/availability.functions";
import { slotsByPlate } from "@/lib/availability-logic";
import { bookingWindowMs } from "@/lib/booking-window";
import { getPlanById } from "@/lib/booking-rules";
import {
  availableClassesForWindow,
  isWindowBookable,
  lowestAvailablePlanPrice,
  pickVehicleForWindow,
  type VehicleLite,
} from "@/lib/plan-availability";

const LONG: VehicleLite = { plate: "LEO MY 101", isActive: true, vehicleClass: "l4h2" };
const SHORT: VehicleLite = { plate: "LEO MY 102", isActive: true, vehicleClass: "l1h1" };
const CRAFTER: VehicleLite = { plate: "OF-DK 1234", isActive: true, vehicleClass: "l5h2" };
const SHORT_INACTIVE: VehicleLite = { plate: "LEO MY 103", isActive: false, vehicleClass: "l1h1" };
const SHORT_2: VehicleLite = { plate: "LEO MY 104", isActive: true, vehicleClass: "l1h1" };

const DAY = "2026-09-25";
const HOUR = 10;

/** Produktionslage: LEO MY 101 belegt 25.09. 10:00 – 26.09. 10:00 (Berlin). */
function slot(plate: string, fromIso: string, toIso: string): BusySlot {
  return { vehiclePlate: plate, start: fromIso, end: toIso };
}
const longBusy = slot("LEO MY 101", "2026-09-25T08:00:00Z", "2026-09-26T08:00:00Z");
const crafterBusy = [
  slot("OF-DK 1234", "2026-09-25T05:30:00Z", "2026-09-25T10:30:00Z"),
  slot("OF-DK 1234", "2026-09-26T08:00:00Z", "2026-09-27T08:00:00Z"),
];

const win = (planId: string, day = DAY, hour = HOUR) => bookingWindowMs(planId, day, hour);

describe("Standardklasse belegt, kurzer Transporter frei", () => {
  const map = slotsByPlate([longBusy, ...crafterBusy]);
  const fleet = [LONG, SHORT, CRAFTER];

  for (const plan of ["3h", "6h", "24h_300"]) {
    it(`${plan} bleibt buchbar über den freien kurzen Transporter`, () => {
      expect(isWindowBookable(map, fleet, win(plan))).toBe(true);
      expect(availableClassesForWindow(map, fleet, win(plan))).toEqual(["l1h1"]);
      expect(pickVehicleForWindow(map, fleet, win(plan))).toBe("LEO MY 102");
    });
  }

  it("Mindestpreis richtet sich nach der verfügbaren Klasse", () => {
    const plan = getPlanById("3h")!;
    const classes = availableClassesForWindow(map, fleet, win("3h"));
    expect(lowestAvailablePlanPrice(plan, classes)).toBe(plan.basePrice);
  });

  it("nur lange Klasse frei → Mindestpreis ist der Langpreis, nicht der Kurzpreis", () => {
    const onlyLong = slotsByPlate([
      slot("LEO MY 102", "2026-09-25T08:00:00Z", "2026-09-25T12:00:00Z"),
      ...crafterBusy,
    ]);
    const plan = getPlanById("3h")!;
    const classes = availableClassesForWindow(onlyLong, fleet, win("3h"));
    expect(classes).toEqual(["l4h2"]);
    expect(lowestAvailablePlanPrice(plan, classes)).toBe(plan.priceL4h2);
  });
});

describe("Flotten-Regeln", () => {
  it("ein kurzer belegt, anderer aktiver kurzer frei", () => {
    const map = slotsByPlate([slot("LEO MY 102", "2026-09-25T08:00:00Z", "2026-09-25T12:00:00Z")]);
    expect(pickVehicleForWindow(map, [SHORT, SHORT_2], win("3h"))).toBe("LEO MY 104");
  });

  it("gesperrte Fahrzeuge zählen nie als verfügbar", () => {
    const map = slotsByPlate([longBusy]);
    expect(isWindowBookable(map, [LONG, SHORT_INACTIVE], win("3h"))).toBe(false);
    expect(availableClassesForWindow(map, [LONG, SHORT_INACTIVE], win("3h"))).toEqual([]);
  });

  it("alle Fahrzeuge belegt → nicht buchbar", () => {
    const map = slotsByPlate([
      longBusy,
      slot("LEO MY 102", "2026-09-25T00:00:00Z", "2026-09-26T00:00:00Z"),
      ...crafterBusy,
    ]);
    expect(isWindowBookable(map, [LONG, SHORT, CRAFTER], win("3h"))).toBe(false);
    expect(lowestAvailablePlanPrice(getPlanById("3h")!, [])).toBeNull();
  });

  it("Teillücken verschiedener Fahrzeuge ergeben keine Verfügbarkeit", () => {
    // Kurzer frei erst ab 13:00, Langer nur bis 13:00 frei → 6h ab 10:00 unmöglich
    const map = slotsByPlate([
      slot("LEO MY 102", "2026-09-25T08:00:00Z", "2026-09-25T11:00:00Z"),
      slot("LEO MY 101", "2026-09-25T11:00:00Z", "2026-09-25T20:00:00Z"),
    ]);
    expect(isWindowBookable(map, [LONG, SHORT], win("6h"))).toBe(false);
    // 3h ab 10:00 passt noch in die Lücke des langen Transporters
    expect(pickVehicleForWindow(map, [LONG, SHORT], win("3h"))).toBe("LEO MY 101");
  });

  it("exakt angrenzend ist frei", () => {
    const map = slotsByPlate([slot("LEO MY 102", "2026-09-25T05:00:00Z", "2026-09-25T08:00:00Z")]);
    expect(isWindowBookable(map, [SHORT], win("3h"))).toBe(true);
  });

  it("Teilüberlappung am Ende blockiert", () => {
    const map = slotsByPlate([slot("LEO MY 102", "2026-09-25T10:00:00Z", "2026-09-25T12:00:00Z")]);
    expect(isWindowBookable(map, [SHORT], win("3h"))).toBe(false);
  });
});

describe("Fahrzeugwahl", () => {
  const map = slotsByPlate([]);
  const fleet = [LONG, SHORT, CRAFTER];

  it("ohne Kundenwahl wird die günstigste verfügbare Klasse gewählt", () => {
    expect(pickVehicleForWindow(map, fleet, win("3h"))).toBe("LEO MY 102");
  });

  it("gültige ausdrückliche Kundenwahl bleibt erhalten", () => {
    expect(pickVehicleForWindow(map, fleet, win("3h"), { preferredPlate: "OF-DK 1234" })).toBe(
      "OF-DK 1234",
    );
  });

  it("ungültige Kundenwahl wird ersetzt", () => {
    const busy = slotsByPlate([longBusy]);
    expect(
      pickVehicleForWindow(busy, fleet, win("24h_300"), { preferredPlate: "LEO MY 101" }),
    ).toBe("LEO MY 102");
  });
});

describe("Zeitraum-Navigation (Datum/Uhrzeit/Rückgabe)", () => {
  it("24h ab 10:00 am 25.09. ist über den kurzen Transporter buchbar", () => {
    const map = slotsByPlate([longBusy, ...crafterBusy]);
    const w = win("24h_300");
    expect(w.end - w.start).toBe(24 * 3600_000);
    expect(pickVehicleForWindow(map, [LONG, SHORT, CRAFTER], w)).toBe("LEO MY 102");
  });

  it("anderer Tag ohne Sperren bleibt für alle Klassen buchbar", () => {
    const map = slotsByPlate([longBusy, ...crafterBusy]);
    expect(availableClassesForWindow(map, [LONG, SHORT, CRAFTER], win("3h", "2026-09-28"))).toEqual([
      "l1h1",
      "l4h2",
      "l5h2",
    ]);
  });

  it("Crafter bleibt am 25.09. nachmittags wieder verfügbar", () => {
    const map = slotsByPlate([longBusy, ...crafterBusy]);
    expect(availableClassesForWindow(map, [LONG, SHORT, CRAFTER], win("3h", DAY, 14))).toEqual([
      "l1h1",
      "l5h2",
    ]);
  });
});
