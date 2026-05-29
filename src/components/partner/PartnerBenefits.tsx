import { RefreshCw, Shield, Repeat, Unlink, MapPin } from "lucide-react";

const BENEFITS = [
  {
    icon: RefreshCw,
    title: "Jederzeit austauschbar",
    text: "Neues Motiv? Aktion? Saisonale Werbung? Die Magnetfolie wird einfach gewechselt – kein Aufwand für dich.",
  },
  {
    icon: Shield,
    title: "Lackschonend",
    text: "Kein Kleber, keine Rückstände, keine Schäden – Magnetfolie haftet sicher, ohne den Transporter zu beschädigen.",
  },
  {
    icon: Repeat,
    title: "Wiederverwendbar",
    text: "Einmal produziert, beliebig oft an- und abnehmbar. Auch bei Pausen bleibt deine Folie verfügbar.",
  },
  {
    icon: Unlink,
    title: "Flexibel kündbar",
    text: "Vertrag läuft aus oder du willst pausieren? Die Folie wird einfach abgenommen – fertig.",
  },
  {
    icon: MapPin,
    title: "Mobile Reichweite",
    text: "Dein Logo fährt täglich durch Leonberg, Stuttgart, Böblingen, Sindelfingen und Ludwigsburg.",
  },
];

export function PartnerBenefits() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {BENEFITS.map((b) => (
        <div
          key={b.title}
          className="p-5 rounded-2xl bg-card border border-border"
        >
          <div className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center">
            <b.icon className="w-4 h-4" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-foreground">{b.title}</h3>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{b.text}</p>
        </div>
      ))}
    </div>
  );
}