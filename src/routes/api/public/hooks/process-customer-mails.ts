import { createFileRoute } from "@tanstack/react-router";

/** Prepared five-minute sweep; schedule stays inactive until release. */
export const Route = createFileRoute("/api/public/hooks/process-customer-mails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.NOTIFY_HOOK_TOKEN;
        const provided = request.headers.get("x-hook-token") ?? "";
        if (!token || provided !== token) return new Response("Unauthorized", { status: 401 });
        const { runCustomerMailsJob } = await import("@/lib/customer-mails-job");
        const result = await runCustomerMailsJob({
          sweep: async () => (await import("@/lib/customer-mail-outbox.server")).runCustomerMailSweep(),
          scan: async () => (await import("@/lib/mail-bounce.server")).scanMailBounces(),
        });
        return Response.json(result.body, { status: result.status });
      },
    },
  },
});
