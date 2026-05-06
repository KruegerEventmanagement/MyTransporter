import logoImage from "@/assets/logo.png";

export function HeroSection() {
  return (
    <section className="pt-16 pb-8 px-4">
      <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
        <img
          src={logoImage}
          alt="MyTransporter Logo"
          className="w-48 md:w-64 mb-8 animate-fade-in"
          width={800}
          height={512}
        />
      </div>
    </section>
  );
}