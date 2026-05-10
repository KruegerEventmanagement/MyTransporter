import logoImage from "@/assets/logo.png";

export function HeroSection() {
  const handleLogoClick = () => {
    window.dispatchEvent(new CustomEvent("mt:go-to-booking-start"));
    const el = document.getElementById("booking");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <section className="pt-12 pb-4 px-4">
      <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
        <button
          type="button"
          onClick={handleLogoClick}
          aria-label="Zur Startseite – Datum und Uhrzeit auswählen"
          className="cursor-pointer bg-transparent border-0 p-0 transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground rounded-md"
        >
          <img
            src={logoImage}
            alt="MyTransporter Logo"
            className="w-72 md:w-96 mb-4 animate-fade-in"
            width={800}
            height={512}
          />
        </button>
      </div>
    </section>
  );
}