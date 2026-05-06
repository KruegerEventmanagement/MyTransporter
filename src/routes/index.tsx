import { createFileRoute } from "@tanstack/react-router";
import { HeroSection } from "@/components/HeroSection";
import { BookingSection } from "@/components/BookingSection";
import { InfoSection } from "@/components/InfoSection";

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
      <InfoSection />
      <footer className="relative py-16 text-center text-sm text-muted-foreground border-t border-border">
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `linear-gradient(oklch(0.3 0 0) 1px, transparent 1px), linear-gradient(90deg, oklch(0.3 0 0) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }} />
        <div className="relative">
          <p className="text-foreground font-medium tracking-wide">© 2026 MyTransporter</p>
          <p className="mt-2 text-muted-foreground">Mindestalter 25 Jahre · Kaution 200 € · Tank nachtanken</p>
        </div>
      </footer>
    </main>
  );
}
