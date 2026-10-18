import { createServerFn } from "@tanstack/react-start";
import { requireActiveAccount } from "@/lib/active-account";

type Ctx = { supabase: { rpc: (f: string, a: Record<string, unknown>) => any }; userId: string };
async function assertAdmin(ctx: Ctx) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error || data !== true) throw new Error("Nicht autorisiert");
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Src = { source: "booking" | "manual"; id: string };
function src(d: any): Src {
  if (!d || (d.source !== "booking" && d.source !== "manual") || typeof d.id !== "string" || !UUID.test(d.id)) throw new Error("Quelle ungültig");
  return { source: d.source, id: d.id };
}
const cents = (v: unknown) => {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > 5_000_00) throw new Error("Betrag ungültig");
  return v;
};
const lib = () => import("@/lib/deposit-review.server");

const adjust = (d: any) => ({
  refundCents: d?.adjust?.refundCents == null ? null : cents(d.adjust.refundCents),
  reason: typeof d?.adjust?.reason === "string" ? d.adjust.reason : null,
  sendMail: d?.adjust?.sendMail === true,
});

export const listOpenDepositsFn = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    return (await lib()).listOpenDeposits();
  });

export const getDepositReviewFn = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator(src)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const ctx = await (await lib()).loadDepositContext(data.source, data.id);
    return JSON.parse(JSON.stringify(ctx));
  });

export const saveDepositDraftFn = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: any) => ({ ...src(d), revision: d?.revision == null ? null : Number(d.revision), items: d?.items, message: typeof d?.message === "string" ? d.message : null, adjust: adjust(d) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    return (await lib()).saveDraft(context.userId, data.source, data.id, data.revision, data.items, data.message, data.adjust);
  });

export const previewDepositMailFn = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: any) => ({ ...src(d), items: d?.items, message: typeof d?.message === "string" ? d.message : null, adjust: adjust(d) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    return (await lib()).previewClosingMail(data.source, data.id, data.items, data.message, data.adjust);
  });

export const recordManualDepositFn = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: any) => ({ ...src(d), cents: cents(d?.cents), method: String(d?.method ?? "") }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (data.source !== "manual") throw new Error("Nur für manuelle Termine");
    await (await lib()).recordManualDeposit(context.userId, data.id, data.cents, data.method);
    return { ok: true };
  });

export const finalizeDepositFn = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: any) => ({ ...src(d), revision: Number(d?.revision), confirmName: String(d?.confirmName ?? ""), confirmRefundCents: cents(d?.confirmRefundCents) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const ctx = await (await lib()).finalizeReview(context.userId, data.source, data.id, data.revision, data.confirmName, data.confirmRefundCents);
    return JSON.parse(JSON.stringify(ctx));
  });

export const continueDepositFn = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator(src)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const ctx = await (await lib()).continueSettlement(context.userId, data.source, data.id);
    return JSON.parse(JSON.stringify(ctx));
  });

/** Nur Statusabgleich mit Stripe: löst nie eine neue Erstattung aus. */
export const refreshDepositFn = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator(src)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (data.source === "booking") {
      const { refreshBookingSettlements } = await import("@/lib/deposit-settlement.server");
      const { productionDeps } = await import("@/lib/deposit-settlement-deps.server");
      await refreshBookingSettlements(productionDeps(), data.id);
    }
    await (await lib()).ensureClosingMail(data.source, data.id).catch(() => undefined);
    return JSON.parse(JSON.stringify(await (await lib()).loadDepositContext(data.source, data.id)));
  });

export const confirmManualPayoutFn = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: any) => ({ ...src(d), method: String(d?.method ?? ""), confirmRefundCents: cents(d?.confirmRefundCents) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (data.source !== "manual") throw new Error("Nur für manuelle Termine");
    return JSON.parse(JSON.stringify(await (await lib()).confirmManualPayout(context.userId, data.id, data.method, data.confirmRefundCents)));
  });
