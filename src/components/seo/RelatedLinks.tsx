import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/preise", label: "Tarife & Preise" },
  { to: "/langzeitmiete", label: "Langzeitmiete ab 7 Tagen" },
  { to: "/umzugstransporter-mieten", label: "Umzugstransporter auswählen" },
  { to: "/transporter-mieten-pforzheim-calw", label: "Abholung Engelsbrand-Grunbach (Pforzheim/Calw)" },
  { to: "/faq", label: "Häufige Fragen" },
  { to: "/kontakt", label: "Kontakt & Abholung Leonberg" },
] as const;

/** Zurückhaltende Querverweise auf die wichtigsten Seiten. */
export function RelatedLinks({ exclude, title = "Weiterlesen" }: { exclude?: string; title?: string }) {
  return (
    <nav aria-label={title} className="mt-10">
      <p className="text-sm font-semibold text-foreground mb-3">{title}</p>
      <ul className="flex flex-wrap gap-2">
        {LINKS.filter((l) => l.to !== exclude).map((l) => (
          <li key={l.to}>
            <Link
              to={l.to}
              className="inline-block rounded-full border border-border px-4 py-1.5 text-sm text-foreground hover:bg-secondary transition-colors"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
