// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { VehiclePicker, type PickerVehicle } from "./VehiclePicker";
import { vehicleSpecNote, vehicleSpecRows } from "@/lib/vehicle-facts";

afterEach(cleanup);

const mk = (id: string, plate: string, n: number, extra: Partial<PickerVehicle> = {}): PickerVehicle => ({
  id, name: `Van ${plate}`, plate, classLabel: "L1H1",
  photo_urls: Array.from({ length: n }, (_, i) => `https://img/${id}-${i}.jpg`), ...extra,
});
const LEO102 = mk("02220fa6-9a77-4069-8a24-f7028365808b", "LEO MY 102", 1);
const PF = mk("b84d0d58-8f7a-4111-ae7b-796fc2f587a1", "PF MY 1003", 6);
const LEO101 = mk("b408f5fe-4a10-4c3c-9f83-ab56a3ac74a5", "LEO MY 101", 0, { classLabel: "L4H2" });

function Harness({ list }: { list: PickerVehicle[] }) {
  const [i, setI] = useState(1);
  return <VehiclePicker vehicles={list} selectedIndex={i} onSelect={setI} />;
}
const mainImg = () => screen.getByRole("region", { name: /Fotos von/ }).querySelector("img");

describe("VehiclePicker", () => {
  it("Galerie mit 6 Bildern: Bildwechsel ändert Fahrzeug nicht; Fahrzeugwechsel setzt Bild zurück", () => {
    render(<Harness list={[LEO102, PF, LEO101]} />);
    expect(screen.getByText("Foto 1 / 6")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Nächstes Foto"));
    fireEvent.click(screen.getByLabelText("Nächstes Foto"));
    expect(screen.getByText("Foto 3 / 6")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("region", { name: /Fotos von/ }), { key: "ArrowLeft" });
    expect(screen.getByText("Foto 2 / 6")).toBeTruthy();
    expect(screen.getByText("Van PF MY 1003")).toBeTruthy();
    fireEvent.click(screen.getByText("Nächster Transporter"));
    expect(screen.getByText("Van LEO MY 101")).toBeTruthy();
    expect(screen.getByText("Noch kein Foto vorhanden")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/PF MY 1003 auswählen/));
    expect(screen.getByText("Foto 1 / 6")).toBeTruthy();
    expect(mainImg()!.getAttribute("src")).toBe("https://img/b84d0d58-8f7a-4111-ae7b-796fc2f587a1-0.jpg");
  });
  it("1 Bild: keine Bildpfeile", () => {
    render(<VehiclePicker vehicles={[LEO102]} selectedIndex={0} onSelect={() => {}} />);
    expect(screen.queryByLabelText("Nächstes Foto")).toBeNull();
  });
  it("Drossel-Badge nur bei LEO MY 102", () => {
    const { rerender } = render(<VehiclePicker vehicles={[LEO102, PF, LEO101]} selectedIndex={0} onSelect={() => {}} />);
    expect(screen.getByText("Auf 100 km/h gedrosselt")).toBeTruthy();
    expect(screen.getByText("Dieser Transporter fährt maximal 100 km/h.")).toBeTruthy();
    for (const idx of [1, 2]) {
      rerender(<VehiclePicker vehicles={[LEO102, PF, LEO101]} selectedIndex={idx} onSelect={() => {}} />);
      expect(screen.queryByText("Auf 100 km/h gedrosselt")).toBeNull();
    }
    // Gleiches Kennzeichen, andere ID → kein Badge
    rerender(<VehiclePicker vehicles={[{ ...LEO102, id: "other" }]} selectedIndex={0} onSelect={() => {}} />);
    expect(screen.queryByText("Auf 100 km/h gedrosselt")).toBeNull();
  });
  it("gesperrte Fahrzeuge nicht wählbar", () => {
    let sel = 0;
    render(<VehiclePicker vehicles={[LEO102, PF]} selectedIndex={0} onSelect={(i) => (sel = i)} statusFor={(v) => (v.id === PF.id ? { disabled: true, label: "belegt" } : undefined)} />);
    fireEvent.click(screen.getByLabelText(/PF MY 1003 auswählen/));
    expect(sel).toBe(0);
  });
});

describe("vehicleSpecRows", () => {
  it("keine erfundenen Werte, Crafter unbestätigt, Erstzulassung", () => {
    const rows = vehicleSpecRows({ id: "43261a5f-cd8a-4bd4-a3db-f89c4741c463", payload_kg: 3000, max_weight_kg: 3500, cargo_height_cm: 214, cargo_volume_m3: 17, first_registration: "2011-11-25" });
    const get = (l: string) => rows.find((r) => r.label === l);
    expect(get("Nutzlast")!.value).toBe("noch nicht bestätigt");
    expect(get("Innenhöhe")!.value).toBe("noch nicht bestätigt");
    expect(get("Ladevolumen")!.value).toBe("noch nicht bestätigt");
    expect(get("Erstzulassung")!.value).toBe("noch nicht bestätigt");
    expect(get("Zul. Gesamtgewicht")).toBeDefined();
    expect(rows.some((r) => /Baujahr/.test(r.label))).toBe(false);
    expect(get("Tankgröße")).toBeUndefined();
    expect(get("Reichweite")).toBeUndefined();
    expect(vehicleSpecRows({ id: "x" })).toEqual([]);
  });
});

describe("Werksmaße L1H1", () => {
  it("mm-genau, Innenhöhe/Hecktür getrennt, Quelle und Hinweis", () => {
    const v = { id: "02220fa6-9a77-4069-8a24-f7028365808b", length_cm: 496.3, width_cm: 205, height_cm: 225.4, cargo_length_cm: 267, cargo_width_cm: 187, cargo_height_cm: 166.2, cargo_width_between_arches_cm: 142.2, rear_door_width_cm: 156.2, rear_door_height_cm: 152, side_door_width_cm: 107.5, side_door_height_cm: 148.5, first_registration: "2007-04-03", specs_status: "werksangabe_modellvariante", specs_source: "Citroën Prospekt 2010" };
    const rows = Object.fromEntries(vehicleSpecRows(v).map((r) => [r.label, r.value]));
    expect(rows["Außenmaße (L × B ohne Spiegel × H)"]).toBe("4,963 m × 2,05 m × 2,254 m");
    expect(rows["Innenhöhe"]).toBe("1,662 m");
    expect(rows["Breite zwischen Radkästen"]).toBe("1,422 m");
    expect(rows["Hecktüröffnung (B × H)"]).toBe("1,562 m × 1,52 m");
    expect(rows["Schiebetüröffnung (B × H)"]).toBe("1,075 m × 1,485 m");
    expect(rows["Erstzulassung"]).toBe("03.04.2007");
    expect(vehicleSpecNote(v)).toMatch(/Werksmaße der Modellvariante.*nachmessen/);
    expect(vehicleSpecNote({ id: "43261a5f-cd8a-4bd4-a3db-f89c4741c463" })).toMatch(/noch nicht/);
  });
});
