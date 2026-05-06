import { createFileRoute } from "@tanstack/react-router";
import { HeroSection } from "@/components/HeroSection";
import { BookingSection } from "@/components/BookingSection";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MyTransporter – Transporter mieten ab 100€" },
      { name: "description", content: "Miete deinen Transporter flexibel und günstig. Ab 100€ für 6 Stunden. Einfach online buchen." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <HeroSection />
      <BookingSection />
      <footer className="py-12 text-center text-sm text-muted-foreground border-t border-border">
        <p>© 2026 MyTransporter. Alle Rechte vorbehalten.</p>
        <p className="mt-1">Mindestalter 25 Jahre · Kaution 200 € · Tank nachtanken</p>
      </footer>
    </main>
  );
}
