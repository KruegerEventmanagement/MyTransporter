import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { buildReturnReminderMail, buildOverdueMail } from "./return-reminder-mail.server";
const a = { firstName: "Max", endText: "21.10.2026, 17:00", vehicle: "Jumper (LEO MY 101)", url: "https://x/trip/1" };
describe("Rückgabe-Mails mit 30-€-Hinweis", () => {
  for (const [name, m] of [["vorher", buildReturnReminderMail(a)], ["danach", buildOverdueMail({ ...a, final: false })], ["letzte", buildOverdueMail({ ...a, final: true })]] as const) {
    it(`${name}: Betreff und Fotoliste`, () => {
      expect(m.subject).toContain("Es drohen 30 € Bearbeitungsgebühr");
      expect(m.text.split("\n")[1]).toBe("Es müssen alle Fotos gemacht und hochgeladen werden:");
      for (const p of ["Tankbeleg", "Kilometerstand", "Innenraum", "Laderaum", "Außen"]) expect(m.text).toContain(p);
    });
  }
});
