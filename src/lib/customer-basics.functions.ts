import { createServerFn } from "@tanstack/react-start";
import { requireActiveAccount } from "@/lib/active-account";
import { checkCustomerBasics, type BasicsField } from "@/lib/customer-basics";

type Basics = { first_name: string; last_name: string; email: string; birth_date: string; phone: string };

function claimEmail(ctx: unknown): string | null {
  const e = (ctx as { claims?: { email?: unknown } })?.claims?.email;
  return typeof e === "string" ? e : null;
}

/** Eigene Pflichtangaben + welche fehlen (für die Ergänzung im Buchungsablauf). */
export const getCustomerBasics = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("profiles").select("first_name, last_name, email, phone, birth_date").eq("id", context.userId).maybeSingle();
    if (error) return { ok: false as const, loadError: true, missing: [] as BasicsField[], values: null };
    const values: Basics = {
      first_name: data?.first_name ?? "", last_name: data?.last_name ?? "",
      email: data?.email || claimEmail(context) || "", birth_date: data?.birth_date ?? "", phone: data?.phone ?? "",
    };
    const c = checkCustomerBasics(values);
    return { ok: c.ok, loadError: false, missing: Object.keys(c.problems) as BasicsField[], values };
  });

/** Speichert nur die geprüften Pflichtfelder des eigenen Profils (Telefon normalisiert, E.164). */
export const saveCustomerBasics = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: Partial<Basics>) => ({
    first_name: String(d?.first_name ?? "").slice(0, 100),
    last_name: String(d?.last_name ?? "").slice(0, 100),
    birth_date: String(d?.birth_date ?? "").slice(0, 10),
    phone: String(d?.phone ?? "").slice(0, 30),
  }))
  .handler(async ({ data, context }) => {
    const { data: cur } = await context.supabase.from("profiles").select("email").eq("id", context.userId).maybeSingle();
    const email = cur?.email || claimEmail(context) || "";
    const c = checkCustomerBasics({ ...data, email });
    if (!c.ok) return { ok: false as const, problems: c.problems };
    const patch: { first_name: string; last_name: string; birth_date: string; phone: string; email?: string } = {
      first_name: c.normalized.first_name, last_name: c.normalized.last_name,
      birth_date: c.normalized.birth_date, phone: c.normalized.phone!,
    };
    if (!cur?.email && email) patch.email = c.normalized.email;
    const { data: upd, error } = await context.supabase.from("profiles").update(patch).eq("id", context.userId).select("id");
    if (error || !Array.isArray(upd) || upd.length === 0) return { ok: false as const, problems: { phone: "Speichern fehlgeschlagen. Bitte erneut versuchen." } as Record<string, string> };
    return { ok: true as const, problems: {} };
  });
