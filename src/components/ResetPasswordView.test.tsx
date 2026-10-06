// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const NOW = Math.floor(Date.now() / 1000);
const jwt = (amr: Array<{ method: string; timestamp: number }>, sub = "u1") =>
  `x.${btoa(JSON.stringify({ sub, amr })).replace(/=+$/, "")}.y`;

const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  onAuthStateChange: vi.fn(),
}));
let emit: ((e: string) => void) | null = null;

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/BrandHomeLink", () => ({ BrandHomeLink: () => null }));
vi.mock("@/components/ForgotPassword", () => ({ ForgotPassword: () => <div>neuer-link</div> }));

import { ResetPasswordView } from "./ResetPasswordView";

function session(amr: Array<{ method: string; timestamp: number }>) {
  return { data: { session: { access_token: jwt(amr), user: { id: "u1" } } } };
}
function setUrl(u: string) {
  window.history.replaceState(null, "", u);
}

beforeEach(() => {
  Object.values(auth).forEach((f) => f.mockReset());
  auth.onAuthStateChange.mockImplementation((cb: (e: string) => void) => {
    emit = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
});
afterEach(() => cleanup());

const formShown = () => screen.queryByText("Passwort speichern");

describe("Passwort-Reset-Seite (simuliert)", () => {
  it("normaler eingeloggter Nutzer + gefälschter Hash: Formular bleibt gesperrt, Token aus URL entfernt", async () => {
    setUrl("/reset-password#access_token=bogus&type=recovery");
    auth.getSession.mockResolvedValue(session([{ method: "password", timestamp: NOW - 30 }]));
    render(<ResetPasswordView />);
    await screen.findByRole("alert");
    expect(formShown()).toBeNull();
    expect(window.location.hash).toBe("");
  });

  it("Code-Austausch ergibt normale OAuth-Sitzung: abgelehnt", async () => {
    setUrl("/reset-password?code=abc");
    auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    auth.getSession.mockResolvedValue(session([{ method: "oauth", timestamp: NOW }]));
    render(<ResetPasswordView />);
    await screen.findByRole("alert");
    expect(formShown()).toBeNull();
  });

  it("abgelehnter Code / Netzwerkfehler: kein ewiges Prüfen", async () => {
    setUrl("/reset-password?code=abc");
    auth.exchangeCodeForSession.mockResolvedValue({ error: { message: "expired" } });
    render(<ResetPasswordView />);
    expect(await screen.findByText(/abgelaufen/)).toBeTruthy();
    cleanup();
    setUrl("/reset-password?code=abc");
    auth.exchangeCodeForSession.mockRejectedValue(new Error("offline"));
    render(<ResetPasswordView />);
    expect(await screen.findByText(/nicht geprüft werden/)).toBeTruthy();
  });

  it("Recovery-Event vor Mount (Hash schon verarbeitet): Sitzung mit AMR recovery schaltet frei", async () => {
    setUrl("/reset-password");
    auth.getSession.mockResolvedValue(session([{ method: "recovery", timestamp: NOW - 5 }]));
    render(<ResetPasswordView />);
    await waitFor(() => expect(formShown()).not.toBeNull());
  });

  it("Recovery-Event nach Mount schaltet frei; fremder Nutzer laut Server nicht", async () => {
    setUrl("/reset-password");
    auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    render(<ResetPasswordView />);
    await screen.findByRole("alert");
    auth.getSession.mockResolvedValue(session([{ method: "recovery", timestamp: NOW }]));
    await act(async () => emit?.("PASSWORD_RECOVERY"));
    await waitFor(() => expect(formShown()).not.toBeNull());
    cleanup();
    auth.getUser.mockResolvedValue({ data: { user: { id: "anderer" } }, error: null });
    render(<ResetPasswordView />);
    await screen.findByRole("alert");
    expect(formShown()).toBeNull();
  });

  it("gültiger Reset: Passwort speichern; Fehler beendet 'busy'", async () => {
    setUrl("/reset-password?token_hash=h&type=recovery");
    auth.verifyOtp.mockResolvedValue({ error: null });
    auth.getSession.mockResolvedValue(session([{ method: "otp", timestamp: NOW }]));
    auth.updateUser.mockRejectedValueOnce(new Error("netz"));
    render(<ResetPasswordView />);
    await waitFor(() => expect(formShown()).not.toBeNull());
    const [a, b] = screen.getAllByLabelText(/Neues Passwort/) as HTMLInputElement[];
    fireEvent.change(a!, { target: { value: "geheim123" } });
    fireEvent.change(b!, { target: { value: "geheim123" } });
    fireEvent.click(screen.getByText("Passwort speichern"));
    expect(await screen.findByText(/Verbindung fehlgeschlagen/)).toBeTruthy();
    expect(screen.getByText("Passwort speichern")).toBeTruthy();
    auth.updateUser.mockResolvedValue({ error: null });
    fireEvent.click(screen.getByText("Passwort speichern"));
    expect(await screen.findByText(/Passwort wurde geändert/)).toBeTruthy();
    expect(auth.updateUser).toHaveBeenLastCalledWith({ password: "geheim123" });
  });
});
