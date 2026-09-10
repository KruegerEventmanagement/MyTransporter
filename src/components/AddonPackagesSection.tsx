import { ADDONS, ADDON_NOTE, ADDON_TRUST } from "@/lib/addons";
import { AddonPackageCard } from "./AddonPackageCard";

export function AddonPackagesSection() {
  return (
    <section className="py-16 px-4 bg-secondary/30">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Pakete für deinen Transport
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Damit dein Umzug einfacher, sicherer und stressfreier wird, kannst du passendes Zubehör
            oder einen Fahrer bzw. Umzugshelfer direkt dazubuchen.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {ADDONS.map((addon) => (
            <AddonPackageCard key={addon.id} addon={addon} marketing />
          ))}
        </div>


        <p className="mt-8 text-xs text-muted-foreground text-center max-w-3xl mx-auto">
          {ADDON_NOTE}
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-card p-5 max-w-3xl mx-auto">
          <p className="text-sm text-foreground text-center">{ADDON_TRUST}</p>
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Die Pakete kannst du direkt im Buchungsvorgang auswählen.
        </p>
      </div>
    </section>
  );
}
