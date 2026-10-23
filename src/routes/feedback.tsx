import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getFeedbackState, submitFeedback } from "@/lib/feedback.functions";

export const Route = createFileRoute("/feedback")({
  validateSearch: (s: Record<string, unknown>): { t?: string } => ({ t: typeof s.t === "string" ? s.t : undefined }),
  head: () => ({
    meta: [
      { title: "Dein Feedback · MyTransporter" },
      { name: "description", content: "Sag uns, wie deine Miete bei MyTransporter war." },
      { property: "og:title", content: "Dein Feedback · MyTransporter" },
      { property: "og:description", content: "Sag uns, wie deine Miete bei MyTransporter war." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const { t = "" } = Route.useSearch();
  const load = useServerFn(getFeedbackState);
  const send = useServerFn(submitFeedback);
  const [state, setState] = useState<"loading" | "invalid" | "form" | "done">("loading");
  const [liked, setLiked] = useState("");
  const [disliked, setDisliked] = useState("");
  const [ideas, setIdeas] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    load({ data: { t } })
      .then((r) => setState(!r.valid ? "invalid" : r.submitted ? "done" : "form"))
      .catch(() => setState("invalid"));
  }, [t]);

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-bold text-foreground">Wie war deine Miete?</h1>
      {state === "loading" && <p className="mt-4 text-muted-foreground">Einen Moment …</p>}
      {state === "invalid" && <p className="mt-4 text-muted-foreground">Dieser Link ist ungültig oder abgelaufen. Schreib uns gern an info@mytransporter.org.</p>}
      {state === "done" && <p className="mt-4 text-foreground">Danke für dein Feedback! Wir lesen jede Rückmeldung persönlich.</p>}
      {state === "form" && (
        <form
          className="mt-6 space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true); setErr(null);
            try {
              const r = await send({ data: { t, liked, disliked, ideas } });
              if (r.ok) setState("done"); else setErr(r.error ?? "Fehler");
            } catch { setErr("Speichern fehlgeschlagen. Bitte später erneut versuchen."); }
            finally { setBusy(false); }
          }}
        >
          <p className="text-muted-foreground">Alles freiwillig. Dein Feedback geht nur an uns, nicht an Google.</p>
          <label className="block space-y-2"><span className="font-medium text-foreground">Was war gut?</span>
            <Textarea value={liked} onChange={(e) => setLiked(e.target.value)} maxLength={2000} /></label>
          <label className="block space-y-2"><span className="font-medium text-foreground">Was war nicht gut?</span>
            <Textarea value={disliked} onChange={(e) => setDisliked(e.target.value)} maxLength={2000} /></label>
          <label className="block space-y-2"><span className="font-medium text-foreground">Was können wir verbessern?</span>
            <Textarea value={ideas} onChange={(e) => setIdeas(e.target.value)} maxLength={2000} /></label>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" disabled={busy}>{busy ? "Wird gesendet …" : "Feedback senden"}</Button>
        </form>
      )}
    </main>
  );
}
