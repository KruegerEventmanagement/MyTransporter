import type { CapacitorConfig } from "@capacitor/cli";
import { capacitorAppId } from "./scripts/capacitor-identity";

// Die App lädt die Live-Website, damit jede Veröffentlichung beim nächsten Start erscheint.
// dist-native liefert nur noch die Offline-Seite (errorPath) und eine Notfall-Shell.
export const LIVE_URL = "https://mytransporter.org";

const config: CapacitorConfig = {
  appId: capacitorAppId(process.argv, process.env.MT_CAPACITOR_PLATFORM),
  appName: "MyTransporter",
  webDir: "dist-native",
  server: {
    url: LIVE_URL,
    cleartext: false,
    errorPath: "offline.html",
    allowNavigation: ["mytransporter.org", "www.mytransporter.org"],
  },
  ios: { contentInset: "never", scheme: "MyTransporter", limitsNavigationsToAppBoundDomains: false },
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 1500, launchAutoHide: true, backgroundColor: "#ffffff", showSpinner: false },
    StatusBar: { style: "LIGHT", overlaysWebView: true },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
