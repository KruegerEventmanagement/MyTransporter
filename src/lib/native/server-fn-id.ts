import { createHash } from "node:crypto";
import { relative } from "node:path";

/**
 * Deterministische Server-Funktions-ID unabhängig vom Build-Verzeichnis.
 * Standard von TanStack Start hasht den ABSOLUTEN Pfad → native Builds aus
 * GitHub-CI hätten andere IDs als der Web-Worker. Wir hashen den
 * projektrelativen POSIX-Pfad (ohne Query) + Exportname.
 */
export function stableServerFnId(filename: string, functionName: string, root: string): string {
  const clean = filename.split("?")[0];
  const rel = relative(root, clean).replace(/\\/g, "/");
  return createHash("sha256").update(`${rel}--${functionName}`).digest("hex");
}
