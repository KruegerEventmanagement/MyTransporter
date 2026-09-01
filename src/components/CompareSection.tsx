export function CompareSection() {
  return (
    <section className="py-14 px-4 sm:px-6 bg-background">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Fair vergleichen</h2>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          Viele Anbieter wirken im Grundpreis günstig, haben aber oft nur wenige Kilometer
          inklusive. Bei MyTransporter wählst du zwischen dem{" "}
          <strong className="text-foreground">kurzen L1H1</strong> und dem{" "}
          <strong className="text-foreground">langen L4H2</strong> – beide mit fairen
          Kilometerpaketen, ideal für echte Umzüge und Transporte.
        </p>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl border border-border p-4">
            <p className="font-semibold text-foreground">Günstiger Gesamtpreis</p>
            <p className="text-muted-foreground mt-1">bei echter Nutzung</p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="font-semibold text-foreground">Faire Kilometer</p>
            <p className="text-muted-foreground mt-1">bis 800 km im Fernstreckentarif</p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="font-semibold text-foreground">Zwei Größen</p>
            <p className="text-muted-foreground mt-1">L1H1 kurz oder L4H2 lang (+10 €/Tag)</p>
          </div>
        </div>
      </div>
    </section>
  );
}