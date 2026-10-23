import type { CapacitorConfig } from "@capacitor/cli";
import { capacitorAppId } from "./scripts/capacitor-identity";

// Lokal gebündelte App-Shell (dist-native), KEIN server.url.
// Server-Funktionen laufen über https://mytransporter.org (src/lib/native/remote-fetch.ts).
const config: CapacitorConfig = {
  appId: capacitorAppId(process.argv, process.env.MT_CAPACITOR_PLATFORM),
  appName: "MyTransporter",
  webDir: "dist-native",
  ios: { contentInset: "never", scheme: "MyTransporter" },
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 1500, launchAutoHide: false, backgroundColor: "#ffffff", showSpinner: false },
    StatusBar: { style: "LIGHT", overlaysWebView: true },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
