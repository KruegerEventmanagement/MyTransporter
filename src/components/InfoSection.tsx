const INFO_ITEMS = [
  {
    icon: "⛽",
    title: "Tank nachtanken",
    description: "Der Tank muss auf den gleichen Stand wie bei Abholung gebracht werden. Tankbeleg bitte hochladen.",
  },
  {
    icon: "📸",
    title: "Fotos vor & nach der Fahrt",
    description: "Fotografiere den Transporter von allen Seiten (außen & innen) vor Antritt und nach Rückgabe.",
  },
  {
    icon: "🔢",
    title: "Kilometerstand",
    description: "Bitte den Kilometerstand vor Fahrtantritt notieren und eingeben.",
  },
  {
    icon: "🪪",
    title: "Verifizierung erforderlich",
    description: "Führerschein + Ausweis (Vorder- & Rückseite). Mindestalter: 25 Jahre.",
  },
];

export function InfoSection() {
  return (
    <section className="relative py-24 px-4 overflow-hidden">
      <div className="absolute inset-0 opacity-40" style={{
        background: 'linear-gradient(180deg, transparent 0%, oklch(0.95 0 0) 30%, oklch(0.95 0 0) 70%, transparent 100%)'
      }} />
      <div className="relative max-w-4xl mx-auto">
        <h2 className="text-3xl md:text-5xl font-bold text-center text-foreground animate-fade-in-up tracking-tight">
          So funktioniert's
        </h2>
        <p className="mt-4 text-center text-muted-foreground text-lg animate-fade-in-up animate-delay-200 tracking-wide">
          Alles was du wissen musst
        </p>

        <div className="mt-16 grid sm:grid-cols-2 gap-6">
          {INFO_ITEMS.map((item, idx) => (
            <div
              key={item.title}
              className={`group relative p-6 rounded-2xl bg-card border border-border shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 animate-fade-in-up animate-delay-${(idx + 2) * 200}`}
            >
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                background: 'radial-gradient(ellipse at 50% 0%, oklch(0.5 0 0 / 5%), transparent 70%)'
              }} />
              <span className="relative text-3xl">{item.icon}</span>
              <h3 className="relative mt-4 text-lg font-semibold text-foreground">{item.title}</h3>
              <p className="relative mt-2 text-muted-foreground text-sm leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}