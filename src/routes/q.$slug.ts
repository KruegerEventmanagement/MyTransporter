import { createFileRoute } from "@tanstack/react-router";
import { handlePartnerScan } from "@/lib/partner-scan";

export const Route = createFileRoute("/q/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) =>
        handlePartnerScan(String(params.slug ?? "").toLowerCase(), {
          lookup: async (slug) => {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data } = await supabaseAdmin.from("partners").select("id, target_path").eq("slug", slug).eq("active", true).maybeSingle();
            return data ?? null;
          },
          recordVisit: async (partnerId) => {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data, error } = await supabaseAdmin.from("partner_visits").insert({ partner_id: partnerId }).select("id").single();
            return error || !data ? null : (data.id as string);
          },
        }),
    },
  },
});
