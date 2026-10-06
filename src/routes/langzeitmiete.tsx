import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { InFlowAd } from "@/components/ads/InFlowAd";
import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Truck, Sparkles } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { LongTermPlanner } from "@/components/LongTermPlanner";
import { LONG_TERM_MIN_DAYS } from "@/lib/long-term";
import { AdRails } from "@/components/ads/AdRails";
import { AdConsentRevokeButton } from "@/components/ads/AdConsentRevokeButton";
import { VideoBackground } from "@/components/VideoBackground";
import fotorVideo from "@/assets/videos/mytransporter-fotor.mp4.asset.json";
import fotorPoster from "@/assets/videos/mytransporter-fotor-poster.jpg.asset.json";

export const Route = createFileRoute("/langzeitmiete")({
  head: () =>
    pageHead({
      path: "/langzeitmiete",
      title: "Transporter Langzeitmiete mit Kilometer-Rechner | MyTransporter",
      description: "Transporter ab 7 Tagen mieten in Leonberg: Fahrzeug wählen, Datum, Uhrzeit und Wunschkilometer eingeben, Richtpreis sofort sehen und direkt anfragen.",
      breadcrumbs: [{ name: "Start", path: "/" }, { name: "Langzeitmiete", path: "/langzeitmiete" }],
    }),
  component: LangzeitmietePage,
});

function LangzeitmietePage() {

  return (
    <div className="relative isolate min-h-screen overflow-x-hidden bg-background">
      <VideoBackground
        src={fotorVideo.url}
        poster={fotorPoster.url}
        title="MyTransporter Langzeitmiete Video"
        fit="contain"
      />
      <Navbar />
      <div className="relative z-10">
      <AdRails>
      <main className="max-w-5xl mx-auto px-4 pt-20 pb-16">
        <header className="text-center max-w-2xl mx-auto rounded-3xl bg-background/90 backdrop-blur-md px-6 py-8 sm:px-10">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
            Langzeitmiete
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Je länger du mietest, desto entspannter wird dein Projekt. Wähle deinen Transporter, gib Zeitraum und
            Wunschkilometer ein und frag direkt per E-Mail an.
          </p>
        </header>

        <LongTermPlanner />

        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: CalendarDays,
              title: "Tagesgenau",
              text: "Kein Aufrunden auf volle Wochen – du zahlst genau deine Miettage.",
            },
            {
              icon: Sparkles,
              title: "Langzeitvorteil",
              text: `Ab ${LONG_TERM_MIN_DAYS} Tagen automatisch günstiger – je länger du mietest, desto stärker der Vorteil.`,
            },
            {
              icon: Truck,
              title: "Drei Größen",
              text: "L1H1 kurz, L4H2 lang und der extra lange Crafter L5H2.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-4">
              <Icon className="w-4 h-4 text-foreground" />
              <h2 className="mt-2 text-sm font-semibold text-foreground">{title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
<InFlowAd placement="inFlowTop" />
        <RelatedLinks exclude="/langzeitmiete" />
        <div className="mt-10 flex justify-center text-sm text-muted-foreground">
          <AdConsentRevokeButton />
        </div>
      </main>
      </AdRails>
      </div>
    </div>
  );
}
