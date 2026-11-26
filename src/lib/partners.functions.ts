import { createServerFn } from "@tanstack/react-start";
import { requireActiveAccount } from "@/lib/active-account";
import { validatePartnerInput, validateRange } from "@/lib/partners-admin";

export const getPartnerStats = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: unknown) => validateRange(d))
  .handler(async ({ data, context }) => {
    const { partnerStats } = await import("@/lib/partners-admin");
    return partnerStats(context as any, data);
  });

export const savePartnerFn = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: unknown) => validatePartnerInput(d))
  .handler(async ({ data, context }) => {
    const { savePartner } = await import("@/lib/partners-admin");
    return savePartner(context as any, data);
  });

/** Registrierungszuordnung nur für den angemeldeten Benutzer selbst (kein frei wählbarer Benutzer). */
export const claimPartnerSignupFn = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: unknown) => {
    const ref = (d as { ref?: unknown } | null)?.ref;
    return { ref: typeof ref === "string" && ref.length <= 64 ? ref : null };
  })
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { claimPartnerSignup } = await import("@/lib/partner-notifications.server");
      return { result: await claimPartnerSignup(supabaseAdmin as any, (context as any).userId, data.ref) };
    } catch {
      return { error: "temporary" as const };
    }
  });

/** Klar gekennzeichnete TEST-Mail an info@mytransporter.org (nur Admin). */
export const sendPartnerTestMailFn = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: unknown) => {
    const id = (d as { partnerId?: unknown } | null)?.partnerId;
    if (typeof id !== "string" || id.length > 64) throw new Error("Partner fehlt.");
    return { partnerId: id };
  })
  .handler(async ({ data, context }) => {
    const { assertPartnerAdmin } = await import("@/lib/partners-admin");
    await assertPartnerAdmin(context as any);
    const { data: p, error } = await (context as any).supabase.from("partners").select("id, name, slug").eq("id", data.partnerId).single();
    if (error || !p) throw new Error("Partner nicht gefunden.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueTestNotification } = await import("@/lib/partner-notifications.server");
    return enqueueTestNotification(supabaseAdmin as any, p);
  });
