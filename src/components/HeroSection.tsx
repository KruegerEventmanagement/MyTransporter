import logoImage from "@/assets/logo.png";

export function HeroSection() {
  return (
    <section className="pt-12 pb-4 px-4">
      <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
        <img
          src={logoImage}
          alt="MyTransporter Logo"
          className="w-72 md:w-96 mb-4 animate-fade-in"
          width={800}
          height={512}
        />
      </div>
    </section>
  );
}