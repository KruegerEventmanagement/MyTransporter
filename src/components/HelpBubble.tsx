import { useEffect, useRef, useState } from "react";
import { HelpCircle, X, Phone, Mail, User, BookOpen } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function HelpBubble() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="fixed z-50 right-4 bottom-4"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {open && (
        <div className="mb-3 w-72 rounded-2xl bg-background border border-border shadow-2xl p-4 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="font-bold text-foreground text-sm">Benötigen Sie Hilfe?</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ich helfe Ihnen gerne persönlich weiter.
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground p-1 -m-1"
              aria-label="Schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2.5 text-sm text-foreground">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium">Christian Krüger</span>
            </div>
            <a
              href="tel:+4915236230118"
              className="flex items-center gap-2.5 text-sm text-foreground rounded-xl bg-secondary px-3 py-2.5 hover:bg-secondary/70"
            >
              <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium">0152 36230118</span>
            </a>
            <a
              href="mailto:info@mytransporter.org"
              className="flex items-center gap-2.5 text-sm text-foreground rounded-xl bg-secondary px-3 py-2.5 hover:bg-secondary/70"
            >
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">info@mytransporter.org</span>
            </a>
            <Link
              to="/mietratgeber"
              className="flex items-center gap-2.5 text-sm text-foreground rounded-xl bg-secondary px-3 py-2.5 hover:bg-secondary/70"
            >
              <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium">Mietratgeber</span>
            </Link>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Hilfe schließen" : "Hilfe öffnen"}
        className="w-12 h-12 rounded-full bg-foreground text-background shadow-lg flex items-center justify-center hover:opacity-90 active:scale-95 transition"
      >
        {open ? <X className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
      </button>
    </div>
  );
}