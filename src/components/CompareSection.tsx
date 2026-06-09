export function CompareSection() {
  return (
    <section className="py-14 px-4 sm:px-6 bg-background">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Fair vergleichen</h2>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          Viele Anbieter wirken im Grundpreis günstig, haben aber oft nur wenige Kilometer
          inklusive. Bei MyTransporter bekommst du einen <strong className="text-foreground">großen
          L4H2-Transporter</strong> mit fairen Kilometerpaketen, ideal für echte Umzüge und Transporte.
        </p>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl border border-border p-4">
            <p className="font-semibold text-foreground">Günstiger Gesamtpreis</p>
            <p className="text-muted-foreground mt-1">bei echter Nutzung</p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="font-semibold text-foreground">Faire Kilometer</p>
            <p className="text-muted-foreground mt-1">großzügig inklusive</p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="font-semibold text-foreground">Großer L4H2</p>
            <p className="text-muted-foreground mt-1">statt kleinem Standard-Transporter</p>
          </div>
        </div>
      </div>
    </section>
  );
}