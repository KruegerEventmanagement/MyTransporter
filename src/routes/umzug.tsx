import { createFileRoute, Link } from "@tanstack/react-router";
import { Phone, MessageCircle, Truck, Package, ShieldCheck, Hand, Link2, CalendarDays, MapPin, Building2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { ORG_ID, SITE_URL, pageHead, type Crumb } from "@/lib/seo";

const PATH = "/umzug";
const CRUMBS: Crumb[] = [
  { name: "Start", path: "/" },
  { name: "Umzug", path: PATH },
];
const UMZUG_CONTACT = {
  phone: "+491789276274",
  phoneDisplay: "0178 9276274",
  whatsappDraft: "Hallo, ich möchte einen Umzug mit MyTransporter anfragen.",
} as const;
const TEL = `tel:${UMZUG_CONTACT.phone}`;
const WHATSAPP = `https://wa.me/${UMZUG_CONTACT.phone.slice(1)}?text=${encodeURIComponent(UMZUG_CONTACT.whatsappDraft)}`;

export const Route = createFileRoute("/umzug")({
  head: () =>
    pageHead({
      path: PATH,
      title: "Professionelle Umzüge – über 10 Jahre Umzugserfahrung | MyTransporter",
      description:
        "Professionelle Umzüge mit MyTransporter: über 10 Jahre Erfahrung im Team, eigene Transporter und passende Ausstattung. Individuelles Angebot: 0178 9276274.",
      breadcrumbs: CRUMBS,
      schema: [
        {
          "@type": "Service",
          "@id": `${SITE_URL}${PATH}#service`,
          name: "Umzug",
          serviceType: "Professionelle Umzüge",
          telephone: UMZUG_CONTACT.phone,
          provider: { "@id": ORG_ID },
          description:
            "Professionelle Umzüge mit über zehn Jahren Erfahrung im Team, eigenen Transportern, Umzugsdecken, Stretchfolie und Gurten. Individuelles Angebot nach persönlicher Absprache.",
        },
      ],
    }),
  component: UmzugPage,
});

function CallButtons({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p className="mb-3 font-semibold text-foreground">Dein direkter Kontakt für Umzüge</p>
      <div className="flex flex-col sm:flex-row gap-3">
      <a
        href={TEL}
        className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-foreground px-8 text-base font-semibold text-background hover:opacity-90 transition-opacity"
      >
        <Phone className="h-5 w-5" aria-hidden="true" />
        Jetzt anrufen: {UMZUG_CONTACT.phoneDisplay}
      </a>
      <a
        href={WHATSAPP}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-border px-8 text-base font-semibold text-foreground hover:bg-secondary transition-colors"
      >
        <MessageCircle className="h-5 w-5" aria-hidden="true" />
        WhatsApp schreiben
      </a>
      </div>
    </div>
  );
}

const EQUIPMENT = [
  { icon: Truck, title: "Eigene Transporter", text: "Passende Fahrzeuge für deine Möbel und Kartons." },
  { icon: ShieldCheck, title: "Umzugsdecken & Stretchfolie", text: "Schützen Oberflächen, Kanten und empfindliche Möbel." },
  { icon: Link2, title: "Professionelle Gurte", text: "Sichern die Ladung während der Fahrt." },
  { icon: Hand, title: "Professionelle Handschuhe", text: "Gehören bei jedem Umzug zur Ausstattung." },
  { icon: Package, title: "Kartons auf Anfrage", text: "Du brauchst Umzugskartons? Sag uns Bescheid, wir besorgen sie." },
] as const;

const PREP = [
  { icon: CalendarDays, text: "Wunschtermin" },
  { icon: MapPin, text: "Start- und Zieladresse" },
  { icon: Package, text: "Ungefähre Menge an Möbeln und Kartons" },
  { icon: Building2, text: "Etagen und ob es einen Aufzug gibt" },
] as const;

function UmzugPage() {
  return (
    <main className="min-h-screen bg-background pt-12">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <header className="py-8 sm:py-14">
          <p className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground">
            <Truck className="h-4 w-4" aria-hidden="true" />
            Über 10 Jahre Umzugserfahrung
          </p>
          <h1 className="mt-6 text-4xl sm:text-5xl font-bold leading-tight text-foreground text-balance">
            <span className="block">Dein Umzug.</span>{" "}
            <span className="block">Professionell von A nach B.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-foreground">
            <strong>Mit über zehn Jahren Umzugserfahrung</strong> bietet dir das Team von MyTransporter
            professionelle Umzüge von A nach B. Wir bringen Erfahrung, eigene Transporter und die
            passende Ausstattung mit, damit dein Umzug gut vorbereitet starten kann.
          </p>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground">
            <strong>Von der ersten Absprache bis zum Transport deiner Möbel und Kartons:</strong>{" "}
            Wir stimmen den Ablauf persönlich mit dir ab und kümmern uns um die vereinbarten
            Leistungen. Du bekommst ein Angebot, das zu deinem Umzug passt.
          </p>
          <CallButtons className="mt-8" />
        </header>

        <section className="mt-6" aria-labelledby="ausstattung">
          <h2 id="ausstattung" className="text-2xl sm:text-3xl font-bold text-foreground">
            Gut geschützt auf dem Weg ins neue Zuhause.
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground leading-relaxed">
            Decken und Stretchfolie schützen Oberflächen, Gurte sichern die Ladung. So bereiten wir
            deine Möbel sorgfältig auf den Transport vor.
          </p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {EQUIPMENT.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4 rounded-2xl border border-border bg-card p-5">
                <Icon className="h-6 w-6 shrink-0 text-foreground" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14" aria-labelledby="angebot">
          <h2 id="angebot" className="text-2xl sm:text-3xl font-bold text-foreground">
            Ein Angebot, das zu deinem Umzug passt.
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground leading-relaxed">
            Ein guter Umzug beginnt mit einer klaren Absprache. Im persönlichen Gespräch besprechen
            wir deinen Wunschtermin, die Strecke, die Menge an Möbeln und Kartons sowie Etagen und
            Zugänge. Nach Einschätzung des Aufwands erhältst du ein individuelles Angebot.
            Leistungen und Preis stimmen wir vor der Beauftragung mit dir ab.
          </p>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {["Umzug besprechen", "Umfang und Preis abstimmen", "Termin und Durchführung vereinbaren"].map(
              (step, i) => (
                <li key={step} className="rounded-2xl bg-secondary p-5">
                  <span className="text-sm font-semibold text-muted-foreground">Schritt {i + 1}</span>
                  <p className="mt-1 font-semibold text-foreground">{step}</p>
                </li>
              ),
            )}
          </ol>
        </section>

        <section className="mt-14 rounded-3xl border border-border bg-card p-6 sm:p-10" aria-labelledby="anrufen">
          <h2 id="anrufen" className="text-2xl sm:text-3xl font-bold text-foreground">
            Lass uns deinen Umzug planen.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Ruf uns an oder schreib uns auf WhatsApp. Gemeinsam besprechen wir, was du brauchst.
            Halte dafür am besten diese Angaben bereit:
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {PREP.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-foreground">
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-muted-foreground">
            Den Termin stimmen wir gemeinsam im Gespräch ab.
          </p>
          <CallButtons className="mt-6" />
        </section>

      </div>
      <footer className="border-t border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            Startseite
          </Link>
          <Link to="/kontakt" className="text-muted-foreground hover:text-foreground transition-colors">
            Kontakt
          </Link>
          <Link to="/impressum" className="text-muted-foreground hover:text-foreground transition-colors">
            Impressum
          </Link>
          <Link to="/datenschutz" className="text-muted-foreground hover:text-foreground transition-colors">
            Datenschutz
          </Link>
        </div>
      </footer>
    </main>
  );
}
