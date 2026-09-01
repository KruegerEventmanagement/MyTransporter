const INFO_ITEMS = [
  {
    icon: "⛽",
    title: "Voll/Voll Tankregel",
    description: "Das Fahrzeug wird vollgetankt übergeben und muss vollgetankt zurückgegeben werden. Der aktuelle Tankbeleg ist bei der Rückgabe in der App hochzuladen.",
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
    <section className="py-24 px-4 bg-secondary/50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground animate-fade-in-up">
          So funktioniert's
        </h2>
        <p className="mt-4 text-center text-muted-foreground text-lg animate-fade-in-up animate-delay-200">
          Alles was du wissen musst
        </p>

        <div className="mt-16 grid sm:grid-cols-2 gap-6">
          {INFO_ITEMS.map((item, idx) => (
            <div
              key={item.title}
              className={`p-6 rounded-2xl bg-card border border-border shadow-sm animate-fade-in-up animate-delay-${(idx + 2) * 200}`}
            >
              <span className="text-3xl">{item.icon}</span>
              <h3 className="mt-4 text-lg font-medium text-foreground">{item.title}</h3>
              <p className="mt-2 text-muted-foreground text-sm leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}