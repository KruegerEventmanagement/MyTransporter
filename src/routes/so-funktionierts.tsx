import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { pageHead } from "@/lib/seo";
import { HOW_COPY, HOW_LANGS, parseHowLang, type HowLang, type VideoKey } from "@/lib/how-it-works-i18n";
import openVideo from "@/assets/schluesselkasten-oeffnen.mp4.asset.json";
import openPoster from "@/assets/schluesselkasten-oeffnen-poster.jpg.asset.json";
import closeVideo from "@/assets/schluesselkasten-schliessen.mp4.asset.json";
import closePoster from "@/assets/schluesselkasten-schliessen-poster.jpg.asset.json";
import obiVideo from "@/assets/schluesselkasten-obi.mp4.asset.json";
import obiPoster from "@/assets/schluesselkasten-obi-poster.jpg.asset.json";

const VIDEOS: Record<VideoKey, { src: string; poster: string }> = {
  open: { src: openVideo.url, poster: openPoster.url },
  close: { src: closeVideo.url, poster: closePoster.url },
  obi: { src: obiVideo.url, poster: obiPoster.url },
};

const STORAGE_KEY = "mt-how-lang";

export const Route = createFileRoute("/so-funktionierts")({
  validateSearch: (s: Record<string, unknown>): { lang?: HowLang } => {
    const lang = parseHowLang(s.lang);
    return lang ? { lang } : {};
  },
  head: () =>
    pageHead({
      path: "/so-funktionierts",
      title: "So funktioniert's: Transporter mieten in 8 Schritten | MyTransporter",
      description:
        "Schritt für Schritt erklärt: Datum, Tarif, Fahrzeug, Verifizierung, Bezahlung, Schlüsselkasten am OBI Leonberg mit Videos, Fahrt und Pflichtfotos.",
      breadcrumbs: [{ name: "Start", path: "/" }, { name: "So funktioniert's", path: "/so-funktionierts" }],
    }),
  component: HowItWorksPage,
});

function HowItWorksPage() {
  const search = Route.useSearch();
  const [lang, setLang] = useState<HowLang>(search.lang ?? "de");

  useEffect(() => {
    if (search.lang) return;
    const stored = parseHowLang(window.localStorage.getItem(STORAGE_KEY));
    if (stored) setLang(stored);
  }, [search.lang]);

  const choose = (l: HowLang) => {
    setLang(l);
    window.localStorage.setItem(STORAGE_KEY, l);
  };

  const t = HOW_COPY[lang];

  return (
    <main className="min-h-screen bg-background" lang={lang}>
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold text-foreground md:text-4xl">{t.heading}</h1>
          <div role="group" aria-label={t.langLabel} className="flex rounded-full border border-border p-1">
            {HOW_LANGS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => choose(l)}
                aria-pressed={lang === l}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-muted-foreground">{t.intro}</p>

        <ol className="mt-10 space-y-6">
          {t.steps.map((step, i) => (
            <li key={i} className="rounded-2xl border border-border bg-card p-5 md:p-6">
              <div className="flex items-start gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-3">
                  <h2 className="text-xl font-semibold text-foreground">{step.title}</h2>
                  {step.text.map((p, j) => (
                    <p key={j} className="text-foreground/90">{p}</p>
                  ))}
                  {step.bullets && (
                    <ul className="list-disc space-y-1 pl-5 text-foreground/90">
                      {step.bullets.map((b, j) => <li key={j}>{b}</li>)}
                    </ul>
                  )}
                  {step.videos && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {step.videos.map((v) => (
                        <figure key={v.key} className="space-y-2">
                          <video
                            src={VIDEOS[v.key].src}
                            poster={VIDEOS[v.key].poster}
                            controls
                            muted
                            playsInline
                            preload="none"
                            className="aspect-[9/16] w-full max-w-xs rounded-xl bg-muted object-cover"
                          />
                          <figcaption className="text-sm font-medium text-muted-foreground">{v.caption}</figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                  {step.after?.map((p, j) => (
                    <p key={j} className={j === step.after!.length - 1 ? "font-semibold text-foreground" : "text-foreground/90"}>{p}</p>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 text-center">
          <Link to="/" className="inline-flex rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90">
            {t.cta}
          </Link>
        </div>
      </div>
    </main>
  );
}
