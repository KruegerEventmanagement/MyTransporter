import { deepLinkToPath } from "./deep-links";
import { listenNativePushTaps } from "./push";

type Nav = (path: string) => void;

/** Führt einen Schritt aus; Fehler/Hänger blockieren den Start nie. */
export async function safeStep(name: string, fn: () => Promise<unknown> | unknown, timeoutMs = 3000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    return true;
  } catch (e) {
    console.warn(`[native] ${name} übersprungen:`, e instanceof Error ? e.message : e);
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

let started = false;

/**
 * Startet native Integrationen (nur in der Capacitor-App). Jeder Schritt ist
 * isoliert; der Splash wird in jedem Fall ausgeblendet. Nur einmal pro Prozess.
 * Native Push: nur Tipp-Listener, kein Versand vorhanden.
 */
export async function startNative(navigate: Nav): Promise<void> {
  if (started) return;
  started = true;
  try {
    document.documentElement.classList.add("mt-native");
    const mods = await Promise.allSettled([
      import("@capacitor/app"),
      import("@capacitor/status-bar"),
      import("@capacitor/network"),
    ]);
    const App = mods[0].status === "fulfilled" ? mods[0].value.App : null;
    const sb = mods[1].status === "fulfilled" ? mods[1].value : null;
    const Network = mods[2].status === "fulfilled" ? mods[2].value.Network : null;

    if (sb) {
      await safeStep("StatusBar.style", () => sb.StatusBar.setStyle({ style: sb.Style.Light }));
      await safeStep("StatusBar.overlay", () => sb.StatusBar.setOverlaysWebView({ overlay: true }));
    }
    if (App) {
      await safeStep("appUrlOpen", () =>
        App.addListener("appUrlOpen", ({ url }) => {
          const path = deepLinkToPath(url);
          if (path) navigate(path);
        }),
      );
      await safeStep("launchUrl", async () => {
        const launch = await App.getLaunchUrl();
        const initial = launch?.url ? deepLinkToPath(launch.url) : null;
        if (initial) navigate(initial);
      });
      await safeStep("backButton", () =>
        App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack) window.history.back();
          else void App.minimizeApp().catch(() => {});
        }),
      );
      await safeStep("resume", () =>
        App.addListener("resume", () => {
          window.dispatchEvent(new Event("focus"));
          document.dispatchEvent(new Event("visibilitychange"));
        }),
      );
    }
    if (Network) {
      await safeStep("network", () =>
        Network.addListener("networkStatusChange", (s) => {
          window.dispatchEvent(new Event(s.connected ? "online" : "offline"));
        }),
      );
    }
    await safeStep("pushTaps", () => listenNativePushTaps(navigate));
  } catch (e) {
    console.warn("[native] Start teilweise fehlgeschlagen:", e instanceof Error ? e.message : e);
  } finally {
    await safeStep("splash", async () => {
      const { SplashScreen } = await import("@capacitor/splash-screen");
      await SplashScreen.hide();
    });
  }
}

/** Nur für Tests. */
export function __resetNativeStart() {
  started = false;
}
