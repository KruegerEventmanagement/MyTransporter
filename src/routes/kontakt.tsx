import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, Phone, MapPin } from "lucide-react";

export const Route = createFileRoute("/kontakt")({
  head: () => ({
    meta: [
      { title: "Kontakt, MyTransporter" },
      { name: "description", content: "Kontaktiere MyTransporter, Transporter mieten in Leonberg" },
    ],
  }),
  component: KontaktPage,
});

function KontaktPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 inline-block">← Zurück</Link>
        <h1 className="text-3xl font-bold text-foreground mb-8">Kontakt</h1>

        <div className="space-y-4">
          <div className="p-6 rounded-2xl bg-secondary flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">Adresse</p>
              <p className="text-sm text-muted-foreground">MyTransporter UG (haftungsbeschränkt)</p>
              <p className="text-sm text-muted-foreground">Römerstraße 36</p>
              <p className="text-sm text-muted-foreground">71229 Leonberg</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-secondary flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">E-Mail</p>
              <a href="mailto:info@mytransporter.de" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                info@mytransporter.de
              </a>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-secondary flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Phone className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">Telefon</p>
              <a href="tel:+4915236230118" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                0152 3623 0118
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 p-6 rounded-2xl border border-border">
          <p className="font-medium text-foreground mb-1">Geschäftsführer</p>
          <p className="text-sm text-muted-foreground">Christian Krüger</p>
          <p className="text-xs text-muted-foreground mt-3">USt-IdNr.: DE328715703</p>
        </div>

        <div className="mt-8 p-4 rounded-xl bg-secondary">
          <p className="text-sm text-muted-foreground">
            Schlüsselabholung und -rückgabe: <span className="text-foreground font-medium">Römerstraße 36, 71229 Leonberg</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">Öffnungszeiten: 08:00, 22:00 Uhr</p>
        </div>
      </div>
    </main>
  );
}