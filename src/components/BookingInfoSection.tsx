const POINTS = [
  "Kaution 200 € – wird nach ordnungsgemäßer Rückgabe zurückerstattet",
  "Führerschein und Ausweis erforderlich",
  "Übergabe mit Fotos und Protokoll",
  "Umzugspaket mit Spanngurten, Zurrgurten, Decken, Klebeband und Handschuhen optional für 29 €",
  "Tankregel Voll/Voll: vollgetankt übernehmen, vollgetankt zurückgeben",
  "Besenrein zurückgeben",
  "Rauchen im Fahrzeug verboten",
  "Auslandsfahrten nur nach vorheriger Absprache",
  "Baustoffe, Schutt oder stark verschmutzende Ladung nur mit Schutzplane und vorheriger Zustimmung",
];

export function BookingInfoSection() {
  return (
    <section className="py-14 px-4 sm:px-6 bg-secondary/30">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground text-center">Gut zu wissen</h2>
        <p className="mt-3 text-muted-foreground text-center">
          Damit alles fair und unkompliziert bleibt.
        </p>
        <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {POINTS.map((p) => (
            <li key={p} className="flex items-start gap-3 rounded-xl border border-border bg-background p-4 text-sm text-foreground">
              <span className="mt-1 inline-block w-1.5 h-1.5 rounded-full bg-foreground flex-shrink-0" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}