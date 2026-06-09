const ITEMS = [
  { title: "L4H2, lang und hoch", body: "Sehr viel Ladevolumen für Möbel, Umzugskartons und sperrige Gegenstände." },
  { title: "Faire Kilometer inklusive", body: "300 km im Umzugstag · 500 km im Langstrecken-Tarif · 1.500 km in der Wochenmiete." },
  { title: "Technisch gepflegt", body: "Neue Bremsen, neue Reifen, neue Federn vorne, Schweller geschweißt, läuft zuverlässig." },
  { title: "Sauber aufbereitet", body: "Fahrraum gründlich gereinigt, Sitze nass gereinigt, du steigst in einen aufgeräumten Transporter ein." },
  { title: "Lokal in Leonberg", body: "Ideal für Leonberg, Stuttgart, Böblingen, Sindelfingen und Ludwigsburg." },
  { title: "Ehrlich kommuniziert", body: "Der Transporter ist nicht neu, aber technisch gepflegt, sauber aufbereitet und bietet sehr viel Platz zum fairen Preis." },
];

export function AdvantagesSection() {
  return (
    <section className="py-16 px-4 sm:px-6 bg-secondary/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">Warum MyTransporter?</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Großer Transporter, faire Kilometer, ehrlicher Preis, das, was du wirklich brauchst.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ITEMS.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-background p-6">
              <h3 className="font-bold text-foreground mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}