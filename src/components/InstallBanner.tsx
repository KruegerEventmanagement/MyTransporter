import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { isTripPath } from "@/lib/active-trip";
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
  // Während Fahrt/Rückgabe nie über Überschrift oder Bedienelementen.
  const onTrip = useRouterState({ select: (st) => isTripPath(st.location.pathname) });

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
    const showTimer = window.setTimeout(() => setVisible(true), 1200);

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
      window.clearTimeout(showTimer);
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

  if (!visible || onTrip) return null;

  const hint =
    platform === "ios-other" ? "In Safari öffnen" : "Auf dem Homescreen speichern";

  return (
    <>
      <div className="fixed left-3 z-40 animate-install-pop-in" style={{ top: "calc(3.5rem + var(--mt-trip-bar, 0px))" }}>
        <div className="flex items-center gap-2 rounded-2xl bg-foreground py-2 pl-2 pr-1.5 text-background animate-install-pulse">
          <button
            onClick={handleInstall}
            className="flex items-center gap-2 text-left active:scale-[0.98] transition-transform"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-background/15">
              <Download className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold leading-tight">App installieren</span>
              <span className="block text-[10px] leading-tight opacity-75">{hint}</span>
            </span>
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Hinweis schließen"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-background/15"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
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