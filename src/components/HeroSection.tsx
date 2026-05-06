import logoImage from "@/assets/logo.png";
import heroVan from "@/assets/hero-van.jpg";

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroVan}
          alt="Transporter"
          className="w-full h-full object-cover opacity-10"
          width={1920}
          height={1080}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 to-background" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto">
        <img
          src={logoImage}
          alt="MyTransporter Logo"
          className="w-64 md:w-96 mb-12 animate-fade-in"
          width={800}
          height={512}
        />
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground animate-fade-in-up">
          Wann brauchst du deinen Transporter?
        </h1>
        <p className="mt-6 text-lg text-muted-foreground animate-fade-in-up animate-delay-200">
          Buche deinen Transporter in wenigen Sekunden. Flexibel, günstig, unkompliziert.
        </p>
        <a
          href="#booking"
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-primary-foreground font-medium text-lg transition-all hover:scale-105 hover:shadow-lg animate-fade-in-up animate-delay-400"
        >
          Jetzt buchen
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </a>
      </div>
    </section>
  );
}