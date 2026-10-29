import { useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { LANGS, useI18n } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGS.find((l) => l.code === lang)!;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("lang.label")}
        aria-expanded={open}
        className="flex min-h-10 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <Globe className="h-4 w-4" />
        {current.short}
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={t("lang.label")}
          className="absolute end-0 top-full z-50 mt-1 w-40 rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          {LANGS.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                role="option"
                aria-selected={l.code === lang}
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
                className={`w-full rounded-lg px-3 py-2 text-start text-sm ${
                  l.code === lang ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"
                }`}
              >
                {l.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
