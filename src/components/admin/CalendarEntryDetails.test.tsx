// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const fetchMock = vi.fn();
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => fetchMock }));
vi.mock("@/lib/calendar-details.functions", () => ({ getCalendarEntryDetails: {} }));

import { CalendarEntryDetailsPanel } from "./CalendarEntryDetails";

const ID = "11111111-1111-4111-8111-111111111111";
const details = (over: object = {}) => ({
  kind: "manual",
  id: ID,
  startAt: "2026-10-09T14:00:00Z",
  endAt: "2026-10-10T14:00:00Z",
  vehicleName: "Jumper",
  vehiclePlate: "TEST 1",
  booking: null,
  customer: { name: "Max Test", phone: null, email: null, birthDate: null, address: null,
    companyName: null, idNumber: null, licenseNumber: null, profileLinked: false },
  notes: null,
  documents: {
    license: { front: { id: "a", docType: "license_front", label: "", signedUrl: "https://signed.test/a.jpg",
      isPdf: false, removedByUser: false, originalName: null }, back: null },
    id: { front: null, back: null },
    others: [],
  },
  ...over,
});

beforeEach(() => {
  cleanup();
  fetchMock.mockReset();
});

describe("CalendarEntryDetailsPanel", () => {
  it("zeigt Berliner Zeiten, leere Felder und aufklappbare Dokumente", async () => {
    fetchMock.mockResolvedValue(details());
    render(<CalendarEntryDetailsPanel kind="manual" id={ID} />);
    expect(await screen.findByText("09.10.2026, 16:00 Uhr")).toBeTruthy();
    expect(screen.getByText("10.10.2026, 16:00 Uhr")).toBeTruthy();
    expect(screen.getByText("Keine Hinweise hinterlegt")).toBeTruthy();
    expect(screen.getAllByText("Nicht hinterlegt").length).toBeGreaterThan(3);
    const btn = screen.getByRole("button", { name: /Führerschein/ });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByAltText("Führerschein · Vorderseite")).toBeTruthy();
    expect(screen.getByText("Führerschein · Rückseite")).toBeTruthy();
  });

  it("Fehler mit Erneut laden lädt frisch", async () => {
    fetchMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(details());
    render(<CalendarEntryDetailsPanel kind="manual" id={ID} />);
    fireEvent.click(await screen.findByRole("button", { name: /Erneut laden/ }));
    expect(await screen.findByText("Max Test")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("verwirft Antwort einer anderen ID", async () => {
    fetchMock.mockResolvedValue(details({ id: "99999999-9999-4999-8999-999999999999" }));
    render(<CalendarEntryDetailsPanel kind="manual" id={ID} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText("Max Test")).toBeNull();
  });
});
