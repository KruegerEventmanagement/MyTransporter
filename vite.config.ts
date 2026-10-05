// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Native-Build (Capacitor): `MT_NATIVE=1 vite build` erzeugt zusätzlich eine
// lokal bündelbare SPA-Shell (_shell.html). Server-Funktionen laufen weiter auf
// dem bestehenden Worker (siehe src/lib/native/remote-fetch.ts). Der normale
// Web-Build bleibt unverändert SSR.
const NATIVE = process.env.MT_NATIVE === "1";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: NATIVE
    ? {
        server: { entry: "server" },
        spa: { enabled: true, prerender: { outputPath: "/_shell.html", crawlLinks: false } },
      }
    : {
        server: { entry: "server" },
      },
  vite: NATIVE ? { define: { "import.meta.env.VITE_MT_NATIVE": JSON.stringify("1") } } : {},
});
