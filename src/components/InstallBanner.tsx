import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "mt-install-dismissed";

export function InstallBanner() {
  const [prompt, setPrompt] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already installed (standalone) → nichts zeigen
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    // In iframe (Lovable Editor Preview) → nichts zeigen
    try {
      if (window.self !== window.top) return;
    } catch {
      return;
    }

    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;

    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BIPEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    if (isIOS) {
      setIosHint(true);
      setVisible(true);
    }

    const installed = () => setVisible(false);
    window.addEventListener("appinstalled", installed);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const handleInstall = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
    }
    setPrompt(null);
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="sticky top-0 z-50 bg-foreground text-background px-4 py-2.5 flex items-center gap-3 shadow-md">
      <div className="w-8 h-8 rounded-lg bg-background/10 flex items-center justify-center shrink-0">
        <Download className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">Als App installieren</p>
        <p className="text-[11px] opacity-80 leading-tight mt-0.5 truncate">
          {iosHint
            ? "Teilen-Symbol → „Zum Home-Bildschirm""
            : "Schneller Zugriff direkt vom Homescreen"}
        </p>
      </div>
      {!iosHint && prompt && (
        <button
          onClick={handleInstall}
          className="rounded-full bg-background text-foreground px-3 py-1.5 text-xs font-bold shrink-0"
        >
          Installieren
        </button>
      )}
      <button
        onClick={handleDismiss}
        aria-label="Schließen"
        className="w-7 h-7 rounded-full hover:bg-background/10 flex items-center justify-center shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}