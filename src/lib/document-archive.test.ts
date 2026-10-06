import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { archiveIssuedDocument, stableStringify } from "./document-archive.server";

function fakeClient() {
  const rows: any[] = [];
  const files: string[] = [];
  const client: any = {
    storage: {
      from: () => ({
        upload: async (path: string) => {
          if (files.includes(path)) return { error: { message: "already exists" } };
          files.push(path);
          return { error: null };
        },
      }),
    },
    from: () => {
      const f: Record<string, unknown> = {};
      const b: any = {
        select: () => b,
        eq: (k: string, v: unknown) => ((f[k] = v), b),
        order: () => b,
        limit: () => b,
        maybeSingle: async () => {
          const m = rows
            .filter((r) => r.kind === f.kind && r.document_number === f.document_number)
            .sort((a, z) => z.revision - a.revision)[0];
          return { data: m ?? null, error: null };
        },
        insert: (row: any) => {
          const r = { ...row, id: `id${rows.length + 1}` };
          rows.push(r);
          return { select: () => ({ single: async () => ({ data: r, error: null }) }) };
        },
      };
      return b;
    },
  };
  return { client, rows, files };
}

const base = {
  kind: "invoice" as const,
  documentNumber: "MT-202610-ABC123",
  documentDate: "2026-10-06",
  items: [],
  netCents: 100, vatRate: 0.19, vatCents: 19, grossCents: 119, nonTaxableCents: 0, totalCents: 119,
  pdfBase64: btoa("%PDF-test"),
  filename: "x.pdf",
};

describe("archiveIssuedDocument", () => {
  it("Buchungsrechnung: Erstfassung bleibt, Neuerzeugung legt nichts neu an", async () => {
    const { client, rows } = fakeClient();
    const a = await archiveIssuedDocument({ ...base, source: "booking", snapshot: { d: 1 } }, client);
    const b = await archiveIssuedDocument({ ...base, source: "booking", snapshot: { d: 2 } }, client);
    expect(a.created).toBe(true);
    expect(b).toEqual({ id: a.id, revision: 1, created: false });
    expect(rows).toHaveLength(1);
  });
  it("Manuell: gleicher Inhalt kein Duplikat, geänderter Inhalt neue Revision", async () => {
    const { client, rows, files } = fakeClient();
    await archiveIssuedDocument({ ...base, source: "manual", snapshot: { a: 1, b: 2 } }, client);
    const same = await archiveIssuedDocument({ ...base, source: "manual", snapshot: { b: 2, a: 1 } }, client);
    const changed = await archiveIssuedDocument({ ...base, source: "manual", snapshot: { a: 9 } }, client);
    expect(same.created).toBe(false);
    expect(changed).toMatchObject({ revision: 2, created: true });
    expect(rows).toHaveLength(2);
    expect(files).toHaveLength(2);
  });
  it("stableStringify ist schlüsselreihenfolge-unabhängig", () => {
    expect(stableStringify({ b: 1, a: [1, { y: 2, x: 1 }] })).toBe(stableStringify({ a: [1, { x: 1, y: 2 }], b: 1 }));
  });
});
