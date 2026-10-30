import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { bookingWindowMs } from "@/lib/booking-window";
import { depositSummary, vehicleColor, VEHICLE_BG, VEHICLE_COLOR_NAME, type DepositSummary } from "@/lib/fleet-timeline";

const DAY_W = 120;
const ROW_H = 64;
const DAY_MS = 86_400_000;
const RANGE_START = new Date("2025-12-01T00:00:00+01:00").getTime();
const BLOCKING = ["paid", "active", "returning", "in_progress", "picked_up", "completed", "returned"];

interface Vehicle { id: string; name: string; plate: string }
interface Entry {
  id: string;
  kind: "online" | "manuell";
  plate: string;
  start: number;
  end: number;
  customer: string;
  plan: string;
  status: string;
  startKm: number | null;
  endKm: number | null;
  freeKm: number | null;
  extraKm: number | null;
  returnedAt: string | null;
  deposit: DepositSummary | null;
  priceEuro: number | null;
}

const eur = (c: number) => (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const dt = (ms: number | string) =>
  new Date(ms).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function FleetTimeline() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Entry | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [now] = useState(() => Date.now());
  const days = Math.ceil((now + 60 * DAY_MS - RANGE_START) / DAY_MS);

  useEffect(() => {
    (async () => {
      try {
        const [v, b, m] = await Promise.all([
          supabase.from("vehicles").select("id, name, plate").order("plate"),
          supabase
            .from("bookings")
            .select("id, user_id, vehicle_plate, plan_id, plan_label, plan_price, start_date, start_hour, status, start_km, end_km, free_km, extra_km, return_reported_at, deposit, deposit_status")
            .in("status", BLOCKING)
            .gte("start_date", "2025-11-25"),
          supabase
            .from("manual_reservations")
            .select("id, vehicle_plate, start_at, end_at, customer_name, total_price_cents")
            .gte("end_at", new Date(RANGE_START).toISOString()),
        ]);
        if (v.error || b.error || m.error) throw new Error("load");
        const bookings = b.data ?? [];
        const ids = bookings.map((x) => x.id);
        const userIds = [...new Set(bookings.map((x) => x.user_id))];
        const [p, s, r] = await Promise.all([
          userIds.length ? supabase.from("profiles").select("id, first_name, last_name").in("id", userIds) : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null }[] }),
          ids.length ? supabase.from("deposit_settlements").select("booking_id, refund_cents, status, refund_status, confirmed_at").in("booking_id", ids) : Promise.resolve({ data: [] }),
          ids.length ? supabase.from("deposit_reviews").select("source_id, status, final_refund_cents, manual_payout_status, finalized_at").eq("source_type", "booking").in("source_id", ids) : Promise.resolve({ data: [] }),
        ]);
        const names = new Map((p.data ?? []).map((x) => [x.id, [x.first_name, x.last_name].filter(Boolean).join(" ")]));
        const list: Entry[] = bookings.map((x) => {
          const w = bookingWindowMs(x.plan_id, x.start_date, x.start_hour);
          return {
            id: x.id, kind: "online", plate: x.vehicle_plate, start: w.start, end: w.end,
            customer: names.get(x.user_id) || "Kunde", plan: x.plan_label, status: x.status,
            startKm: x.start_km, endKm: x.end_km, freeKm: x.free_km, extraKm: x.extra_km,
            returnedAt: x.return_reported_at, priceEuro: Number(x.plan_price),
            deposit: depositSummary({
              depositEuro: Number(x.deposit), depositStatus: x.deposit_status,
              settlements: ((s.data ?? []) as any[]).filter((y) => y.booking_id === x.id),
              review: ((r.data ?? []) as any[]).find((y) => y.source_id === x.id) ?? null,
            }),
          };
        });
        for (const x of m.data ?? []) {
          list.push({
            id: x.id, kind: "manuell", plate: x.vehicle_plate, start: Date.parse(x.start_at), end: Date.parse(x.end_at),
            customer: x.customer_name, plan: "Manuelle Buchung", status: "manuell", startKm: null, endKm: null,
            freeKm: null, extraKm: null, returnedAt: null, deposit: null,
            priceEuro: x.total_price_cents !== null ? x.total_price_cents / 100 : null,
          });
        }
        setVehicles(v.data ?? []);
        setEntries(list.sort((a, c) => a.start - c.start));
      } catch {
        setError("Zeitleiste konnte nicht geladen werden.");
      }
    })();
  }, []);

  const numbered = useMemo(() => {
    const counter = new Map<string, number>();
    const res = new Map<string, number>();
    for (const e of entries) {
      const k = e.plate.replace(/[^A-Z0-9]/gi, "").toUpperCase();
      counter.set(k, (counter.get(k) ?? 0) + 1);
      res.set(e.id, counter.get(k)!);
    }
    return res;
  }, [entries]);

  const jumpToday = () => {
    scroller.current?.scrollTo({ left: ((now - RANGE_START) / DAY_MS) * DAY_W - 200, behavior: "smooth" });
  };
  useEffect(() => { if (vehicles.length) jumpToday(); }, [vehicles.length]);

  const x = (ms: number) => ((ms - RANGE_START) / DAY_MS) * DAY_W;
  const same = (a: string, b: string) => a.replace(/[^A-Z0-9]/gi, "").toUpperCase() === b.replace(/[^A-Z0-9]/gi, "").toUpperCase();

  if (error) return <p role="alert" className="rounded-2xl border-2 border-foreground p-3 text-sm">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">Fuhrpark-Zeitleiste</h2>
        <button onClick={jumpToday} className="rounded-full bg-foreground px-4 py-1.5 text-sm text-background">Heute</button>
        <div className="flex flex-wrap gap-3 text-xs">
          {vehicles.map((v) => (
            <span key={v.id} className="flex items-center gap-1">
              <span className={`h-3 w-3 rounded-full ${VEHICLE_BG[vehicleColor(v.plate)]}`} />
              {v.plate} ({VEHICLE_COLOR_NAME[vehicleColor(v.plate)]})
            </span>
          ))}
        </div>
      </div>

      <div className="flex rounded-2xl border border-border overflow-hidden">
        <div className="shrink-0 w-32 border-r border-border bg-background z-10">
          <div className="h-12 border-b border-border" />
          {vehicles.map((v) => (
            <div key={v.id} style={{ height: ROW_H }} className="flex flex-col justify-center border-b border-border px-2">
              <span className="text-sm font-semibold">{v.plate}</span>
              <span className="truncate text-[10px] text-muted-foreground">{v.name}</span>
            </div>
          ))}
        </div>
        <div ref={scroller} className="overflow-x-auto">
          <div className="relative" style={{ width: days * DAY_W }}>
            <div className="flex h-12 border-b border-border">
              {Array.from({ length: days }, (_, i) => {
                const d = new Date(RANGE_START + i * DAY_MS);
                return (
                  <div key={i} style={{ width: DAY_W }} className="shrink-0 border-r border-border text-center">
                    <div className="text-xs font-semibold">{d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" })}</div>
                    <div className="flex text-[9px] text-muted-foreground">
                      {[0, 6, 12, 18].map((h) => <span key={h} className="flex-1 text-left pl-0.5">{h}h</span>)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="absolute top-12 bottom-0 w-0.5 bg-foreground z-20" style={{ left: x(now) }} aria-label="Jetzt" />
            {vehicles.map((v) => (
              <div key={v.id} style={{ height: ROW_H }} className="relative border-b border-border">
                {entries.filter((e) => same(e.plate, v.plate)).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setSelected(e)}
                    style={{ left: x(e.start), width: Math.max(24, x(e.end) - x(e.start)), top: 6, height: ROW_H - 12 }}
                    className={`absolute overflow-hidden rounded-lg px-1.5 text-left text-[11px] leading-tight text-background shadow ${VEHICLE_BG[vehicleColor(v.plate)]} ${selected?.id === e.id ? "ring-2 ring-foreground" : ""}`}
                    title={`${e.customer} · ${dt(e.start)} – ${dt(e.end)}`}
                  >
                    <div className="font-bold truncate">#{numbered.get(e.id)} {e.customer}</div>
                    <div className="truncate">{e.startKm ?? "?"} → {e.endKm ?? "?"} km</div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {selected && (
        <div className="rounded-2xl border border-border p-4 text-sm space-y-1">
          <div className="flex justify-between">
            <h3 className="font-bold text-base">#{numbered.get(selected.id)} {selected.customer} · {selected.plate}</h3>
            <button onClick={() => setSelected(null)} className="text-muted-foreground">Schließen</button>
          </div>
          <p>{selected.kind === "online" ? "Online-Buchung" : "Manuelle Buchung"} · {selected.plan} · Status: {selected.status}</p>
          <p>Zeitraum: {dt(selected.start)} – {dt(selected.end)}</p>
          {selected.returnedAt && <p>Abgegeben: {dt(selected.returnedAt)}</p>}
          {selected.priceEuro !== null && <p>Mietpreis: {eur(Math.round(selected.priceEuro * 100))}</p>}
          <p>
            Kilometer: Start {selected.startKm ?? "fehlt"} · Ende {selected.endKm ?? "fehlt"}
            {selected.startKm !== null && selected.endKm !== null && ` · gefahren ${selected.endKm - selected.startKm} km`}
            {selected.freeKm !== null && ` · inklusive ${selected.freeKm} km`}
            {selected.extraKm ? ` · Mehrkilometer ${selected.extraKm} km` : ""}
          </p>
          {selected.deposit ? (
            <p>
              Kaution gezahlt: {eur(selected.deposit.paidCents)} · <strong>{selected.deposit.label}</strong>
              {selected.deposit.refundedCents !== null && `: ${eur(selected.deposit.refundedCents)}`}
              {selected.deposit.refundedAt && ` am ${dt(selected.deposit.refundedAt)}`}
            </p>
          ) : (
            <p>Kaution: siehe Reiter „Offene Kautionen“ (manuelle Buchung)</p>
          )}
        </div>
      )}
    </div>
  );
}
