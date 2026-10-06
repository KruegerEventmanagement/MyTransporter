/**
 * Bearbeitungspauschale für fehlende Fahrzeugdokumentation – nur Hinweis und Einordnung.
 * Es gibt bewusst KEINE automatische Belastung: Jeder Fall wird von MyTransporter manuell geprüft.
 * Technische Fehler (Kamera, Galerie, Upload, Netz, Plattform) sind nie ein Pauschalen-Kandidat.
 */
export const DOCUMENTATION_FEE_NAME = "Bearbeitungspauschale für fehlende Fahrzeugdokumentation";
export const DOCUMENTATION_FEE_EUR = 30;
export const DOCUMENTATION_FEE_NOTICE =
  "Bei fehlenden oder nicht verwertbaren Pflichtfotos entsteht zusätzlicher manueller Prüf- und Bearbeitungsaufwand. Hierfür wird eine Bearbeitungspauschale von 30 € berechnet.";
export const DOCUMENTATION_FEE_TECH_NOTE =
  "Technische Probleme mit Kamera, Galerie, Upload, Internet oder unserer Plattform lösen die Pauschale nicht aus; sie werden von uns geprüft.";

export type ExceptionKind = "technical" | "not_provided";

export const EXCEPTION_KIND_PREFIX: Record<ExceptionKind, string> = {
  technical: "[Technisches Problem] ",
  not_provided: "[Nachweis nicht bereitgestellt] ",
};

export const EXCEPTION_KIND_LABEL: Record<ExceptionKind, string> = {
  technical: "Technisches Problem (Kamera, Galerie, Upload, Internet)",
  not_provided: "Ich kann/möchte den Nachweis nicht bereitstellen",
};

export function exceptionKind(value: string | null | undefined): ExceptionKind | null {
  if (!value) return null;
  for (const k of Object.keys(EXCEPTION_KIND_PREFIX) as ExceptionKind[]) {
    if (value.startsWith(EXCEPTION_KIND_PREFIX[k])) return k;
  }
  return null;
}

export function stripExceptionKind(value: string | null | undefined): string {
  const v = value ?? "";
  const k = exceptionKind(v);
  return k ? v.slice(EXCEPTION_KIND_PREFIX[k].length) : v;
}

export function withExceptionKind(kind: ExceptionKind, text: string): string {
  return EXCEPTION_KIND_PREFIX[kind] + stripExceptionKind(text);
}

/**
 * Einordnung für die manuelle Prüfung. autoCharge ist immer false.
 * Nur bewusst nicht bereitgestellte Nachweise können nach Prüfung zur Pauschale führen.
 */
export function classifyDocumentationGaps(exceptions: Record<string, string | undefined>) {
  const technical: string[] = [];
  const notProvided: string[] = [];
  const unclassified: string[] = [];
  for (const [key, value] of Object.entries(exceptions)) {
    if (!value) continue;
    const k = exceptionKind(value);
    if (k === "technical") technical.push(key);
    else if (k === "not_provided") notProvided.push(key);
    else unclassified.push(key);
  }
  return { technical, notProvided, unclassified, feeReviewCandidate: notProvided.length > 0, autoCharge: false as const };
}
