import logoImage from "@/assets/logo.png";
function goToBooking() {
  window.dispatchEvent(new CustomEvent("mt:go-to-booking-start"));
  document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function HeroSection() {
  return (
    <section className="pt-10 pb-6 px-4">
      <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
        <button
          type="button"
          onClick={goToBooking}
          aria-label="Zur Buchung, Datum und Uhrzeit auswählen"
          className="cursor-pointer bg-transparent border-0 p-0 transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground rounded-md"
        >
          <img
            src={logoImage}
            alt="MyTransporter Logo"
            className="w-64 md:w-80 mb-3"
            width={800}
            height={512}
          />
        </button>

      </div>
    </section>
  );
}
