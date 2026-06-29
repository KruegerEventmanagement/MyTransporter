import { useEffect, useState } from "react";
import { Download, X, Share, Plus, MoreVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "mt-install-dismissed";

type Platform = "ios-safari" | "ios-other" | "android" | "desktop";

function detectPlatform(ua: string): Platform {
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
  if (isIOS) {
    const isSafari = !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
    return isSafari ? "ios-safari" : "ios-other";
  }
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function InstallBanner() {
  const [prompt, setPrompt] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    try {
      if (window.self !== window.top) return;
    } catch {
      return;
    }

    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;

    const ua = window.navigator.userAgent;
    const p = detectPlatform(ua);
    setPlatform(p);
    setVisible(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installed = () => {
      setVisible(false);
      setGuideOpen(false);
    };
    window.addEventListener("appinstalled", installed);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const handleInstall = async () => {
    if (prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setVisible(false);
      setPrompt(null);
      return;
    }
    // Kein nativer Prompt verfügbar → Anleitung zeigen
    setGuideOpen(true);
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  if (!visible) return null;

  const subtitle =
    platform === "ios-safari"
      ? "Tippe auf Anleitung — in wenigen Schritten installiert"
      : platform === "ios-other"
      ? "Auf iPhone bitte in Safari öffnen"
      : "Schneller Zugriff direkt vom Homescreen";

  const buttonLabel = prompt ? "Installieren" : "Anleitung";

  return (
    <>
    <div className="sticky top-0 z-50 bg-foreground text-background px-4 py-2.5 flex items-center gap-3 shadow-md">
      <div className="w-8 h-8 rounded-lg bg-background/10 flex items-center justify-center shrink-0">
        <Download className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">Als App installieren</p>
        <p className="text-[11px] opacity-80 leading-tight mt-0.5 truncate">
          {subtitle}
        </p>
      </div>
      <button
        onClick={handleInstall}
        className="rounded-full bg-background text-foreground px-3 py-1.5 text-xs font-bold shrink-0"
      >
        {buttonLabel}
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Schließen"
        className="w-7 h-7 rounded-full hover:bg-background/10 flex items-center justify-center shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
    <InstallGuide platform={platform} open={guideOpen} onOpenChange={setGuideOpen} />
    </>
  );
}

function InstallGuide({
  platform,
  open,
  onOpenChange,
}: {
  platform: Platform;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const steps =
    platform === "ios-safari"
      ? [
          { icon: <Share className="w-5 h-5" />, text: "Tippe unten in Safari auf das Teilen-Symbol." },
          { icon: <Plus className="w-5 h-5" />, text: "Wähle „Zum Home-Bildschirm“." },
          { icon: <Download className="w-5 h-5" />, text: "Tippe oben rechts auf „Hinzufügen“." },
        ]
      : platform === "ios-other"
      ? [
          { icon: <Share className="w-5 h-5" />, text: "Öffne diese Seite in Safari (Chrome/Firefox können auf iPhone keine Apps installieren)." },
          { icon: <Share className="w-5 h-5" />, text: "In Safari: Teilen-Symbol antippen." },
          { icon: <Plus className="w-5 h-5" />, text: "„Zum Home-Bildschirm“ → „Hinzufügen“." },
        ]
      : platform === "android"
      ? [
          { icon: <MoreVertical className="w-5 h-5" />, text: "Öffne das Browser-Menü (drei Punkte oben rechts)." },
          { icon: <Plus className="w-5 h-5" />, text: "Wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“." },
          { icon: <Download className="w-5 h-5" />, text: "Bestätige mit „Installieren“." },
        ]
      : [
          { icon: <Download className="w-5 h-5" />, text: "Klicke in der Adressleiste auf das Installations-Symbol." },
          { icon: <MoreVertical className="w-5 h-5" />, text: "Oder im Browser-Menü: „MyTransporter installieren“." },
          { icon: <Plus className="w-5 h-5" />, text: "Bestätige mit „Installieren“." },
        ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>MyTransporter installieren</DialogTitle>
          <DialogDescription>
            So legst du MyTransporter als App auf deinem Startbildschirm ab.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 mt-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 font-bold text-sm">
                {i + 1}
              </div>
              <div className="flex-1 flex items-center gap-2 text-sm text-foreground">
                <span className="shrink-0 opacity-70">{s.icon}</span>
                <span>{s.text}</span>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground mt-2">
          Nach der Installation öffnet sich MyTransporter wie eine native App – ohne Browser-Leiste.
        </p>
      </DialogContent>
    </Dialog>
  );
}