import { DOCUMENTATION_FEE_NAME, DOCUMENTATION_FEE_NOTICE, DOCUMENTATION_FEE_TECH_NOTE } from "@/lib/documentation-fee";

/** Sachlicher Hinweis zur Bearbeitungspauschale – keine Abbuchungsbehauptung. */
export function DocumentationFeeNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="note"
      data-testid="documentation-fee-notice"
      className="mb-4 rounded-2xl border-2 border-foreground bg-secondary p-3 text-xs leading-relaxed text-foreground"
    >
      <p className="font-semibold">{DOCUMENTATION_FEE_NAME}</p>
      <p className="mt-1">{DOCUMENTATION_FEE_NOTICE}</p>
      {!compact && <p className="mt-1 text-muted-foreground">{DOCUMENTATION_FEE_TECH_NOTE}</p>}
    </div>
  );
}
