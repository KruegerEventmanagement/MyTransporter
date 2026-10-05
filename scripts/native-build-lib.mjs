// Reine Hilfsfunktionen für build-native.mjs (getestet in src/lib/native/build-native.test.ts).
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Alle Ausgabeordner, die vor einem Native-Build entfernt werden (kein stale Build). */
export const FRESH_OUTPUTS = [".output", "dist", "dist-native.tmp"];

/** Mögliche Client-Ausgaben in Prioritätsreihenfolge (Nitro → Vite/Cloudflare → flach). */
export const CLIENT_CANDIDATES = [".output/public", "dist/client", "dist"];

/** Liefert den Client-Ordner, der die SPA-Shell enthält, oder wirft mit klarer Meldung. */
export function findClientOutput(root, exists = existsSync) {
  for (const rel of CLIENT_CANDIDATES) {
    if (exists(join(root, rel, "_shell.html"))) return rel;
  }
  throw new Error(
    `_shell.html in keinem Build-Ordner gefunden (${CLIENT_CANDIDATES.join(", ")}) – SPA-Prerender fehlgeschlagen`,
  );
}

/** Dateien, die nicht in die App gehören (Web-Service-Worker, Server-Bundles). */
export function shouldCopy(relPath) {
  const p = relPath.replace(/\\/g, "/");
  if (p === "sw.js") return false;
  if (p.startsWith("server/") || p.startsWith("_worker") || p.endsWith(".map")) return false;
  return true;
}

/** Plattformsicherer Aufruf (Windows benötigt .cmd/shell für npx). */
export function spawnArgs(platform = process.platform) {
  return platform === "win32"
    ? { cmd: "npx.cmd", args: ["vite", "build"], shell: true }
    : { cmd: "npx", args: ["vite", "build"], shell: false };
}
