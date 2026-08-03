import { Link } from "@tanstack/react-router";
import { ArrowRight, Megaphone } from "lucide-react";

export function AdBanner() {
  return (
    <section className="px-4 pb-4" aria-label="Werbefläche am Transporter">
      <Link
        to="/werbung"
        className="group relative block max-w-3xl mx-auto overflow-hidden rounded-2xl border border-foreground/15 bg-secondary/60 px-4 py-3 transition-all hover:border-foreground/40 hover:shadow-md"
      >
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/10 to-transparent animate-shine" />
        <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-background">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-background opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-background" />
            </span>
            Neu · Aktion
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-bold leading-tight text-foreground">
              <Megaphone className="h-3.5 w-3.5 shrink-0" />
              Ihre Werbung durch die gesamte Region mit MyTransporter
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Täglich gesehen in Leonberg, Stuttgart &amp; ganz Baden-Württemberg – jetzt ab 19 € netto / Monat
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background transition-transform group-hover:translate-x-0.5">
            Jetzt Fläche buchen
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </Link>
    </section>
  );
}
