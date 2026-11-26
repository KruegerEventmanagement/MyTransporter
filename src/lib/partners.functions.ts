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
