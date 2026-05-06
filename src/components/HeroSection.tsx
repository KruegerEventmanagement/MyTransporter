import logoImage from "@/assets/logo.png";

export function HeroSection() {
  return (
    <section className="relative pt-20 pb-12 px-4 overflow-hidden">
      {/* Decorative grid */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `linear-gradient(oklch(0.3 0 0) 1px, transparent 1px), linear-gradient(90deg, oklch(0.3 0 0) 1px, transparent 1px)`,
        backgroundSize: '60px 60px'
      }} />
      {/* Radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full opacity-10" style={{
        background: 'radial-gradient(ellipse, oklch(0.5 0 0), transparent 70%)'
      }} />
      <div className="relative flex flex-col items-center text-center max-w-3xl mx-auto">
        <img
          src={logoImage}
          alt="MyTransporter Logo"
          className="w-72 md:w-96 lg:w-[500px] mb-6 animate-fade-in drop-shadow-lg"
          width={1200}
          height={400}
        />
      </div>
    </section>
  );
}