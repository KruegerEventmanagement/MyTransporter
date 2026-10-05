// Baut die lokal gebündelte App-Shell für Capacitor (dist-native).
import { execSync } from "node:child_process";
import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
execSync("vite build", { stdio: "inherit", env: { ...process.env, MT_NATIVE: "1" } });
const src = existsSync("dist/client") ? "dist/client" : "dist";
rmSync("dist-native", { recursive: true, force: true });
cpSync(src, "dist-native", { recursive: true });
if (!existsSync("dist-native/_shell.html")) throw new Error("_shell.html fehlt – SPA-Prerender fehlgeschlagen");
renameSync("dist-native/_shell.html", "dist-native/index.html");
rmSync("dist-native/sw.js", { force: true }); // Web-Service-Worker nicht in der App
console.log("dist-native bereit");
