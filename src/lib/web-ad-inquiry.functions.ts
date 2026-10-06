import { createServerFn } from "@tanstack/react-start";
import type { WebAdInquiryResult } from "./web-ad-inquiry";

const TYPE = "web_ad_inquiry";

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Öffentliche, validierte und ratenbegrenzte Anfrage für direkt vermietete Website-Werbeplätze. */
export const submitWebAdInquiry = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data)
  .handler(async ({ data }): Promise<WebAdInquiryResult> => {
    const { processWebAdInquiry } = await import("./web-ad-inquiry.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendEmail } = await import("./booking-emails.server");
    return processWebAdInquiry(data, {
      now: () => new Date(),
      countRecent: async (since, email) => {
        let q = supabaseAdmin
          .from("admin_notifications")
          .select("id", { count: "exact", head: true })
          .eq("type", TYPE)
          .gte("created_at", since.toISOString());
        if (email) q = q.ilike("body", `%E-Mail: ${escapeLike(email)}%`);
        const { count, error } = await q;
        if (error) throw new Error("rate_limit_lookup_failed");
        return count ?? 0;
      },
      store: async (title, body) => {
        const { error } = await supabaseAdmin.from("admin_notifications").insert({ type: TYPE, title, body });
        if (error) console.error("web_ad_inquiry store failed", error.code);
        return !error;
      },
      mail: (subject, html) => sendEmail("info@mytransporter.org", subject, html),
    });
  });
