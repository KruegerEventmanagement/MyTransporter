// Baut die lokal gebündelte App-Shell für Capacitor (dist-native).
// Ablauf: alte Ausgaben löschen → MT_NATIVE-Build → echten Client-Ordner mit _shell.html finden
// → nur Client-Assets nach dist-native.tmp → _shell.html → index.html, sw.js raus → atomar ersetzen.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
import { relative, resolve } from "node:path";
import { FRESH_OUTPUTS, findClientOutput, shouldCopy, spawnArgs } from "./native-build-lib.mjs";

const root = process.cwd();
for (const d of FRESH_OUTPUTS) rmSync(resolve(root, d), { recursive: true, force: true });

const { cmd, args, shell } = spawnArgs();
const res = spawnSync(cmd, args, { stdio: "inherit", shell, env: { ...process.env, MT_NATIVE: "1" } });
if (res.status !== 0) {
  console.error(`vite build fehlgeschlagen (Exit ${res.status ?? res.error?.message})`);
  process.exit(res.status || 1);
}

const srcRel = findClientOutput(root);
const src = resolve(root, srcRel);
const tmp = resolve(root, "dist-native.tmp");
cpSync(src, tmp, {
  recursive: true,
  filter: (p) => p === src || shouldCopy(relative(src, p)),
});
renameSync(resolve(tmp, "_shell.html"), resolve(tmp, "index.html"));
rmSync(resolve(tmp, "sw.js"), { force: true });
if (!existsSync(resolve(tmp, "index.html"))) throw new Error("index.html fehlt in dist-native.tmp");

rmSync(resolve(root, "dist-native"), { recursive: true, force: true });
renameSync(tmp, resolve(root, "dist-native"));
console.log(`dist-native bereit (Quelle: ${srcRel})`);
