// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { BookingPhotoUpload, canUploadBookingPhotos } from "./BookingPhotoUpload";

describe("BookingPhotoUpload", () => {
  it("zeigt Kamera und Galerie bei bezahlter Buchung", () => {
    render(<BookingPhotoUpload bookingId="b1" status="confirmed" onUploaded={() => {}} />);
    expect(screen.getByText("Foto aufnehmen")).toBeTruthy();
    expect(screen.getByText("Aus Galerie wählen")).toBeTruthy();
    expect(screen.getByLabelText("Kamera").getAttribute("capture")).toBe("environment");
  });
  it("keine Upload-Fläche bei stornierter Buchung", () => {
    expect(canUploadBookingPhotos("cancelled")).toBe(false);
    expect(canUploadBookingPhotos("completed")).toBe(true);
  });
});
