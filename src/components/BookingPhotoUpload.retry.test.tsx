// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const save = vi.fn();
vi.mock("@/lib/trip-photo-store", () => ({ saveTripPhoto: (...a: unknown[]) => save(...a) }));
vi.mock("@/lib/image-capture", async (orig) => ({ ...(await orig<object>()), normalizeImageFile: async (f: File) => f }));
import { BookingPhotoUpload } from "./BookingPhotoUpload";

describe("BookingPhotoUpload – Erneut versuchen", () => {
  it("zeigt nach fehlgeschlagenem zweiten Versuch wieder Fehler + Knopf statt Dauer-Spinner", async () => {
    save.mockRejectedValue(new Error("Netz weg"));
    render(<BookingPhotoUpload bookingId="b1" status="confirmed" onUploaded={() => {}} />);
    const input = screen.getByLabelText("Kamera") as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] } }); });
    await waitFor(() => screen.getByText("Erneut versuchen"));
    await act(async () => { fireEvent.click(screen.getByText("Erneut versuchen")); });
    await waitFor(() => expect(screen.getByText("Erneut versuchen")).toBeTruthy());
    expect(screen.queryByText("Wird hochgeladen…")).toBeNull();
    expect(save).toHaveBeenCalledTimes(2);
  });
});
