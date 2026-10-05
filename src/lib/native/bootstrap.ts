import { deepLinkToPath } from "./deep-links";
import { listenNativePushTaps } from "./push";

type Nav = (path: string) => void;

/**
 * Startet native Integrationen (nur in der Capacitor-App):
 * StatusBar/Splash, Deep Links, Zurück-Taste, App-Resume und Netzwerkwechsel.
 * Resume/Netz lösen die bestehenden Browser-Ereignisse aus, auf die Fahrtansicht,
 * Rückgabeentwurf und Fotoqueue bereits hören (focus/online/visibilitychange).
 */
export async function startNative(navigate: Nav): Promise<void> {
  const [{ App }, { StatusBar, Style }, { SplashScreen }, { Network }] = await Promise.all([
    import("@capacitor/app"),
    import("@capacitor/status-bar"),
    import("@capacitor/splash-screen"),
    import("@capacitor/network"),
  ]);

  document.documentElement.classList.add("mt-native");
  try {
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setOverlaysWebView({ overlay: true });
  } catch {
    /* iOS: setOverlaysWebView nicht unterstützt */
  }

  await App.addListener("appUrlOpen", ({ url }) => {
    const path = deepLinkToPath(url);
    if (path) navigate(path);
  });
  const launch = await App.getLaunchUrl().catch(() => undefined);
  const initial = launch?.url ? deepLinkToPath(launch.url) : null;
  if (initial) navigate(initial);

  await App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.minimizeApp();
  });

  await App.addListener("resume", () => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await Network.addListener("networkStatusChange", (s) => {
    window.dispatchEvent(new Event(s.connected ? "online" : "offline"));
  });

  await listenNativePushTaps(navigate);
  await SplashScreen.hide().catch(() => {});
}
