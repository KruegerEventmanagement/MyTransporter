import { useI18n } from "@/lib/i18n";

/** Rechtstexte bleiben deutsch; bei anderer Sprache kurzer Hinweis. */
export function LegalLangNotice() {
  const { lang, t } = useI18n();
  if (lang === "de") return null;
  return (
    <p className="mb-6 rounded-xl border border-border bg-secondary px-4 py-3 text-sm font-medium text-foreground">
      {t("legal.germanBinding")}
    </p>
  );
}
