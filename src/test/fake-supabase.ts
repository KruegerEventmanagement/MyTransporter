/**
 * Minimaler, vollständig gemockter Backend-Client für Komponententests.
 * Antworten werden pro Tabelle/Operation als Warteschlange oder Funktion hinterlegt.
 */
import { vi } from "vitest";

type Result = { data?: unknown; error?: unknown };
type Responder = Result | ((state: QueryState) => Result | Promise<Result>);

export interface QueryState {
  table: string;
  op: "select" | "insert" | "update";
  values?: unknown;
  filters: Array<[string, unknown]>;
}

export function createFakeSupabase() {
  const responses: Record<string, Responder[]> = {};
  const calls: QueryState[] = [];
  const storageCalls: Array<{ op: string; path: string }> = [];
  const storage = {
    upload: [] as Result[],
    signedUrl: ((path: string) => ({ data: { signedUrl: `https://signed.example/${path}` }, error: null })) as (
      path: string,
    ) => Result,
  };

  const respond = async (state: QueryState): Promise<Result> => {
    const key = `${state.table}.${state.op}`;
    const queue = responses[key];
    const r = queue && queue.length > 1 ? queue.shift()! : queue?.[0];
    if (!r) return { data: state.op === "select" ? [] : null, error: null };
    return typeof r === "function" ? r(state) : r;
  };

  const query = (table: string) => {
    const state: QueryState = { table, op: "select", filters: [] };
    const q: Record<string, unknown> = {
      select: () => q,
      insert: (v: unknown) => {
        state.op = "insert";
        state.values = v;
        return q;
      },
      update: (v: unknown) => {
        state.op = "update";
        state.values = v;
        return q;
      },
      eq: (c: string, v: unknown) => {
        state.filters.push([c, v]);
        return q;
      },
      is: () => q,
      neq: () => q,
      order: () => q,
      single: () => q,
      maybeSingle: () => q,
      then: (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => {
        calls.push(state);
        return respond(state).then(res, rej);
      },
    };
    return q;
  };

  const client = {
    from: vi.fn((table: string) => query(table)),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (path: string) => {
          storageCalls.push({ op: "upload", path });
          const r = storage.upload.length > 1 ? storage.upload.shift()! : (storage.upload[0] ?? { error: null });
          if (r.error === "throw") throw new Error("Netzwerk");
          return { data: r.error ? null : { path }, error: r.error ?? null };
        }),
        createSignedUrl: vi.fn(async (path: string) => {
          storageCalls.push({ op: "sign", path });
          return storage.signedUrl(path);
        }),
      })),
    },
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-test", email: "kunde@example.test" } } })),
    },
    channel: vi.fn(() => {
      const ch = { on: () => ch, subscribe: () => ch };
      return ch;
    }),
    removeChannel: vi.fn(),
  };

  return {
    client,
    calls,
    storageCalls,
    storage,
    on(table: string, op: QueryState["op"], ...rs: Responder[]) {
      responses[`${table}.${op}`] = rs;
    },
    reset() {
      Object.keys(responses).forEach((k) => delete responses[k]);
      calls.length = 0;
      storageCalls.length = 0;
      storage.upload = [];
      storage.signedUrl = (path) => ({ data: { signedUrl: `https://signed.example/${path}` }, error: null });
    },
  };
}
