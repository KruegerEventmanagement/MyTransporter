// @vitest-environment jsdom
// Geführter Rückgabe-Wizard: 6 Kernfotos (+ bedingter Tankbeleg), Bestätigen/Erneut, Zurück ohne Verlust,
// Übersicht mit Bearbeiten, Abschluss, Offline-Warteschlange, Ausnahmen/Pauschale, Altfälle.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { domError, imageFile, installMediaMocks, setMediaDevices } from "@/test/media-mocks";

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());
const shared = await vi.hoisted(async () => ({ store: (await import("@/lib/photo-queue")).memoryQueueStore() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: fake.client }));
vi.mock("@/lib/photo-queue", async (orig) => ({
  ...(await orig<typeof import("@/lib/photo-queue")>()),
  openIdbQueueStore: async () => shared.store,
}));
vi.mock("@/lib/admin-notify", () => ({ notifyAdmin: vi.fn() }));
vi.mock("@/lib/odometer-ai.functions", () => ({ recognizeOdometer: "recognize" }));
vi.mock("@/lib/trip-return.functions", () => ({ reportReturn: "report" }));
const reportImpl = vi.fn();
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: string) =>
    fn === "report" ? (a: unknown) => reportImpl(a) : async () => ({ km: null, fuelPercent: null, confidence: "low" }),
}));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

import { DASHBOARD_HINT, KEY_RETURN_HINT, RETURN_DONE_TITLE, ReturnFlow } from "./ReturnFlow";

let online = true;
const setOnline = (v: boolean) => {
  online = v;
  if (v) window.dispatchEvent(new Event("online"));
};
Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });

const CORE = ["post_front", "post_back", "post_left", "post_right", "post_interior", "post_dashboard"];
const queueTags = () => [...shared.store.items.values()].map((i) => i.tag).sort();
const uploadedPaths = () => fake.storageCalls.filter((c) => c.op === "upload").map((c) => String((c as { path?: string }).path ?? ""));
const confirmedTags = new Set<string>();

const camInput = () => screen.getByTestId("return-camera-input") as HTMLInputElement;
const galInput = () => screen.getByTestId("return-gallery-input") as HTMLInputElement;
async function pick(kind: "camera" | "gallery", file = imageFile("p.png", "image/png")) {
  const input = kind === "camera" ? camInput() : galInput();
  await act(async () => {
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    fireEvent.change(input);
  });
  expect(input.value).toBe("");
  await screen.findByTestId("candidate-preview");
}
async function confirm() {
  fireEvent.click(screen.getByText("Bestätigen"));
  await screen.findByTestId("slot-confirmed");
}
const nextBtn = () => screen.getByRole("button", { name: /^(Weiter|Zur Übersicht)/ }) as HTMLButtonElement;
const progress = () => screen.getByTestId("wizard-progress").textContent;

async function start() {
  fireEvent.click(screen.getByText(/Jetzt Fotos hochladen/));
  await screen.findByTestId("return-wizard");
}
async function shootSlide(kind: "camera" | "gallery" = "camera") {
  await pick(kind);
  await confirm();
}
async function fillDashboard(refueled: boolean, km = "150") {
  await shootSlide();
  fireEvent.change(screen.getByLabelText("Kilometerstand (Ende)"), { target: { value: km } });
  fireEvent.change(screen.getByLabelText("Tankstand (Ende, in %)"), { target: { value: "80" } });
  fireEvent.click(screen.getByLabelText(refueled ? "Ja" : "Nein"));
}
async function runAll(refueled = false) {
  await start();
  for (let i = 0; i < 5; i += 1) {
    await shootSlide(i % 2 ? "gallery" : "camera");
    fireEvent.click(nextBtn());
    await waitFor(() => expect(screen.queryByTestId("slot-confirmed")).toBeNull());
  }
  await fillDashboard(refueled);
  await act(async () => fireEvent.click(nextBtn()));
  if (refueled) {
    await screen.findByTestId("slide-tank_receipt");
    await shootSlide();
    fireEvent.click(nextBtn());
  }
  await screen.findByTestId("return-overview");
}

beforeEach(() => {
  installMediaMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  fake.reset();
  localStorage.clear();
  shared.store.items.clear();
  confirmedTags.clear();
  reportImpl.mockReset();
  online = true;
  fake.storage.upload = [{ error: null }];
  fake.on("trip_photos", "insert", (st) => {
    const v = st.values as { photo_type: string };
    confirmedTags.add(v.photo_type);
    return { data: { id: v.photo_type }, error: null };
  });
  fake.on("bookings", "update", () => (online ? { data: [{ id: "b1" }], error: null } : Promise.reject(new TypeError("Failed to fetch"))));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mount = (p: Partial<React.ComponentProps<typeof ReturnFlow>> = {}) =>
  render(<ReturnFlow bookingId="b1" planId="km" startKm={100} userId="u1" onComplete={vi.fn()} {...p} />);

describe("Rückgabe-Wizard", () => {
  it("Start: CTA „Jetzt Fotos hochladen“, Pauschalen-Hinweis, kein Abschluss vor Fotos", async () => {
    mount();
    expect(screen.getByTestId("documentation-fee-notice").textContent).toMatch(/Bearbeitungspauschale von 30 €/);
    expect(screen.queryByText("Buchung abschließen")).toBeNull();
    await start();
    expect(progress()).toBe("1 von 6");
    expect(screen.getByTestId("outline-front")).toBeTruthy();
  });

  it("genau 6 Kernschritte mit Fortschritt, Perspektive und richtiger Zuordnung; ohne Tanken kein Belegschritt", async () => {
    mount();
    await start();
    const expected = [
      ["Fahrzeug vorne", "front"],
      ["Fahrzeug hinten", "back"],
      ["Fahrzeug linke Seite", "left"],
      ["Fahrzeug rechte Seite", "right"],
      ["Innenraum", "interior"],
    ];
    for (const [i, [title, outline]] of expected.entries()) {
      expect(progress()).toBe(`${i + 1} von 6`);
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
      expect(screen.getByTestId(`outline-${outline}`)).toBeTruthy();
      expect(nextBtn().disabled).toBe(true);
      await shootSlide();
      fireEvent.click(nextBtn());
      await waitFor(() => expect(screen.queryByTestId("slot-confirmed")).toBeNull());
    }
    expect(progress()).toBe("6 von 6");
    expect(screen.getByTestId("slide-hint").textContent).toBe(DASHBOARD_HINT);
    expect(DASHBOARD_HINT).toBe("Zündung einschalten. Kilometerstand und Tankstand müssen auf demselben Foto vollständig und gut erkennbar sein.");
    expect(screen.getByTestId("outline-dashboard")).toBeTruthy();
    await fillDashboard(false);
    await act(async () => fireEvent.click(nextBtn()));
    await screen.findByTestId("return-overview");
    await waitFor(() => expect([...confirmedTags].sort()).toEqual([...CORE].sort()));
    for (const t of CORE) expect(screen.getByTestId(`card-${t}`)).toBeTruthy();
    expect(screen.queryByTestId("card-tank_receipt")).toBeNull();
  });

  it("getankt → zusätzlicher Tankbeleg-Schritt (7), Abschluss mit v2-Modus", async () => {
    reportImpl.mockResolvedValue({ ok: true, returnCode: "ABC234", reviewReason: null });
    mount();
    await start();
    for (let i = 0; i < 5; i += 1) {
      await shootSlide();
      fireEvent.click(nextBtn());
      await waitFor(() => expect(screen.queryByTestId("slot-confirmed")).toBeNull());
    }
    await fillDashboard(true);
    expect(progress()).toBe("6 von 7");
    await act(async () => fireEvent.click(nextBtn()));
    await screen.findByTestId("slide-tank_receipt");
    expect(progress()).toBe("7 von 7");
    expect(screen.getByTestId("outline-receipt")).toBeTruthy();
    await shootSlide();
    fireEvent.click(nextBtn());
    await screen.findByTestId("return-overview");
    await waitFor(() => expect(confirmedTags.has("tank_receipt")).toBe(true));
    fireEvent.click(screen.getByText("Buchung abschließen"));
    expect(await screen.findByText(RETURN_DONE_TITLE)).toBeTruthy();
    expect(screen.getByTestId("key-return-hint").textContent).toBe(KEY_RETURN_HINT);
    expect(screen.getByText("ABC234")).toBeTruthy();
    expect(reportImpl).toHaveBeenCalledTimes(1);
    expect(reportImpl.mock.calls[0]![0]).toMatchObject({ data: { bookingId: "b1", endKm: 150, mode: { flow: "v2", refueled: true } } });
  });

  it("Vorschau: erst „Bestätigen“ speichert; „Erneut aufnehmen“ ersetzt Kandidat; gleiche Datei erneut", async () => {
    online = false;
    fake.storage.upload = [{ error: "throw" }];
    mount();
    await start();
    const f = imageFile("gleich.png", "image/png");
    await pick("camera", f);
    expect(queueTags()).toEqual([]);
    expect(nextBtn().disabled).toBe(true);
    const again = screen.getByText("Erneut aufnehmen").closest("label")!;
    expect(again.htmlFor).toBe(camInput().id);
    await pick("camera", f);
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    expect(queueTags()).toEqual([]);
    await confirm();
    expect(queueTags()).toEqual(["post_front"]);
    expect(screen.getByTestId("slot-confirmed").textContent).toMatch(/auf diesem Gerät gespeichert/);
    expect(nextBtn().disabled).toBe(false);
    // Galerie-Kandidat bietet „Andere auswählen“ über die Galerie
    fireEvent.click(nextBtn());
    await pick("gallery", f);
    expect(screen.getByText("Andere auswählen").closest("label")!.htmlFor).toBe(galInput().id);
  });

  it("Zurück/Weiter ohne Datenverlust", async () => {
    mount();
    await start();
    await shootSlide();
    fireEvent.click(nextBtn());
    await screen.findByTestId("slide-post_back");
    fireEvent.click(screen.getByRole("button", { name: /Zurück/ }));
    await screen.findByTestId("slide-post_front");
    expect(screen.getByTestId("slot-confirmed")).toBeTruthy();
    expect(nextBtn().disabled).toBe(false);
  });

  it("Übersicht: Stift ersetzt genau dieses Foto und führt zurück zur Übersicht; alte Nachweise bleiben", async () => {
    mount();
    await runAll(false);
    const before = uploadedPaths().filter((p) => p.includes("post_left")).length;
    fireEvent.click(screen.getByLabelText("Fahrzeug linke Seite bearbeiten"));
    await screen.findByTestId("slide-post_left");
    await pick("gallery");
    fireEvent.click(screen.getByText("Bestätigen"));
    await screen.findByTestId("return-overview");
    await waitFor(() => expect(uploadedPaths().filter((p) => p.includes("post_left")).length).toBe(before + 1));
  });

  it("Abschluss gesperrt, solange ein Pflichtnachweis fehlt (z. B. wiederhergestellte Übersicht)", async () => {
    localStorage.setItem(
      "mt_return_draft_v1:u1:b1",
      JSON.stringify({ v: 1, updatedAt: 1, started: true, step: "overview", endKm: "150", refueled: false, exceptions: {} }),
    );
    fake.on("trip_photos", "select", {
      data: ["post_front", "post_back", "post_left", "post_right", "post_interior"].map((t) => ({ photo_type: t, photo_url: `b1/${t}_1.jpg`, created_at: "2026-10-06" })),
      error: null,
    });
    mount();
    await screen.findByTestId("return-overview");
    await waitFor(() => expect(screen.getAllByLabelText("Foto gespeichert").length).toBe(5));
    expect((screen.getByText("Buchung abschließen") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("card-post_dashboard").textContent).toMatch(/Fehlt noch/);
  });

  it("Altfall: Entwurf aus alter Ansicht + getrennte Tacho-/Tankfotos → Instrumentenschritt erledigt", async () => {
    localStorage.setItem(
      "mt_return_draft_v1:u1:b1",
      JSON.stringify({ v: 1, updatedAt: 1, started: true, step: "km", slide: 5, endKm: "150", exceptions: {} }),
    );
    fake.on("trip_photos", "select", {
      data: ["post_odometer", "post_fuel"].map((t) => ({ photo_type: t, photo_url: `b1/${t}_1.jpg`, created_at: "2026-10-06" })),
      error: null,
    });
    mount();
    await screen.findByTestId("slide-post_dashboard");
    expect(await screen.findByTestId("slot-confirmed")).toBeTruthy();
    expect((screen.getByLabelText("Kilometerstand (Ende)") as HTMLInputElement).value).toBe("150");
  });

  it("gespeicherter Server-Code zeigt Abschlussansicht ohne neue Meldung", () => {
    mount({ serverReturnCode: "ABC234" });
    expect(screen.getByText(RETURN_DONE_TITLE)).toBeTruthy();
    expect(screen.getByText("ABC234")).toBeTruthy();
    expect(reportImpl).not.toHaveBeenCalled();
  });
});

describe("Rückgabe-Wizard – iOS/Android Foto-Wege", () => {
  it("Kamera-Input mit capture, Galerie ohne capture, beide echt und per label verknüpft", async () => {
    mount();
    await start();
    expect(camInput().getAttribute("capture")).toBe("environment");
    expect(galInput().hasAttribute("capture")).toBe(false);
    expect(galInput().accept).toMatch(/\.heic/);
    for (const i of [camInput(), galInput()]) {
      expect(i.type).toBe("file");
      expect(i.className).not.toMatch(/\bhidden\b/);
    }
    expect(screen.getByText("Foto aufnehmen").closest("label")!.htmlFor).toBe(camInput().id);
    expect(screen.getByText("Aus Galerie auswählen").closest("label")!.htmlFor).toBe(galInput().id);
  });

  it("Live-Kamera fehlt oder verweigert: Galerie/Kamera am Slide funktionieren weiter, HEIC wird angenommen", async () => {
    setMediaDevices(async () => Promise.reject(domError("NotAllowedError")));
    online = false;
    fake.storage.upload = [{ error: "throw" }];
    mount();
    await start();
    fireEvent.click(screen.getByText(/Live-Kamera mit Rahmen/));
    expect(await screen.findByText(/Kamerazugriff nicht erlaubt/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Schließen"));
    await pick("gallery", new File([new Uint8Array([1, 2])], "IMG.HEIC", { type: "image/heic" }));
    await confirm();
    const item = [...shared.store.items.values()][0]!;
    expect(item.tag).toBe("post_front");
    expect((item.blob as Blob).type).toBe("image/heic");
    setMediaDevices(null);
  });
});

describe("Rückgabe-Wizard – Offline-Warteschlange", () => {
  it("offline alles erfassen → Reload → Reconnect → erst Uploads, dann genau ein Abschluss", async () => {
    online = false;
    fake.storage.upload = [{ error: "throw" }];
    mount();
    await runAll(true);
    expect(queueTags()).toEqual([...CORE, "tank_receipt"].sort());
    expect(screen.getByTestId("photo-queue").textContent).toMatch(/7 Foto\(s\) noch nicht übertragen/);
    expect(screen.getByTestId("km-local")).toBeTruthy();
    fireEvent.click(screen.getByText("Buchung abschließen"));
    expect(screen.getByTestId("report-pending").textContent).toMatch(/noch nicht serverseitig bestätigt/);
    expect(reportImpl).not.toHaveBeenCalled();

    cleanup();
    mount();
    await screen.findByTestId("report-pending");
    expect(screen.getByTestId("photo-queue").textContent).toMatch(/7 Foto\(s\)/);

    fake.storage.upload = [{ error: null }];
    reportImpl.mockImplementation(async () => {
      expect(confirmedTags.size).toBe(7);
      expect(shared.store.items.size).toBe(0);
      return { ok: true, returnCode: "XYZ789", reviewReason: null };
    });
    await act(async () => setOnline(true));
    expect(await screen.findByText("XYZ789")).toBeTruthy();
    expect(reportImpl).toHaveBeenCalledTimes(1);
    await act(async () => setOnline(true));
    expect(reportImpl).toHaveBeenCalledTimes(1);
  });

  it("ohne Nutzeraktion wird nie automatisch abgeschlossen", async () => {
    mount();
    await act(async () => setOnline(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(reportImpl).not.toHaveBeenCalled();
  });
});

describe("Rückgabe-Wizard – Ausnahmen und Bearbeitungspauschale", () => {
  it("technisches Problem ohne Pauschale, bewusst nicht bereitgestellt mit 30-€-Hinweis; Weiter erst mit Begründung", async () => {
    mount();
    await start();
    fireEvent.click(screen.getByText("Foto nicht möglich?"));
    expect(screen.queryByLabelText(/Bitte kurz begründen/)).toBeNull();
    fireEvent.click(screen.getByLabelText(/Technisches Problem/));
    expect(screen.getByTestId("exception-photos-technical").textContent).toMatch(/keine Bearbeitungspauschale/);
    expect(screen.queryByTestId("exception-photos-fee")).toBeNull();
    expect(nextBtn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Bitte kurz begründen/), { target: { value: "Galerie öffnet nicht" } });
    expect(nextBtn().disabled).toBe(false);
    fireEvent.click(screen.getByLabelText(/nicht bereitstellen/));
    expect(screen.getByTestId("exception-photos-fee").textContent).toMatch(/30 €/);
    const draft = () => JSON.stringify(Object.fromEntries(Object.entries(localStorage)));
    await waitFor(() => expect(draft()).toMatch(/\[Nachweis nicht bereitgestellt\] Galerie öffnet nicht/));
  });
});
