import { createHash } from "node:crypto";
import { relative } from "node:path";

/**
 * Deterministische Server-Funktions-ID unabhängig vom Build-Verzeichnis.
 * Spiegel des TanStack-Compiler-Defaults (projektrelativ) – nur für Tests,
 * nicht in vite.config.ts eingebunden. Hasht den
 * projektrelativen POSIX-Pfad (ohne Query) + Exportname.
 */
export function stableServerFnId(filename: string, functionName: string, root: string): string {
  const clean = filename.split("?")[0];
  const rel = relative(root, clean).replace(/\\/g, "/");
  return createHash("sha256").update(`${rel}--${functionName}`).digest("hex");
}
