import { createFileRoute } from "@tanstack/react-router";
import { handlePartnerScan } from "@/lib/partner-scan";

export const Route = createFileRoute("/q/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = String(params.slug ?? "").toLowerCase();
        return handlePartnerScan(slug, {
          lookup: async (slug) => {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data } = await supabaseAdmin.from("partners").select("id, target_path, name, slug").eq("slug", slug).eq("active", true).maybeSingle();
            return data ?? null;
          },
          recordVisit: async (partnerId) => {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data, error } = await supabaseAdmin.from("partner_visits").insert({ partner_id: partnerId }).select("id").single();
            return error || !data ? null : (data.id as string);
          },
          afterVisit: async (visitId, partner) => {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { enqueueScanNotification } = await import("@/lib/partner-notifications.server");
            return enqueueScanNotification(supabaseAdmin as any, visitId, { name: partner.name ?? slug, slug: partner.slug ?? slug });
          },
        });
      },
    },
  },
});
