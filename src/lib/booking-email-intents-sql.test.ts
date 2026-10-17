import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../../drizzle/migrations/0007_booking_email_intents_and_recovery.sql", import.meta.url), "utf8");
async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TABLE bookings(id uuid PRIMARY KEY,user_id uuid,created_at timestamptz DEFAULT now(),status text,vehicle_name text,vehicle_plate text,plan_id text,plan_label text,plan_price numeric,start_date text,start_hour integer,pickup_code text,addons jsonb,addons_total_cents integer);
    CREATE TABLE manual_reservations(id uuid PRIMARY KEY,revision integer DEFAULT 1,customer_name text,customer_email text,vehicle_name text,vehicle_plate text,start_at timestamptz,end_at timestamptz,total_price_cents integer,pickup_address text,confirmation_requested boolean DEFAULT false);
    CREATE TABLE customer_mail_outbox(kind text CONSTRAINT customer_mail_outbox_kind_check CHECK(kind IN ('invoice')));
    CREATE TABLE manual_reservation_customer_mails(id uuid PRIMARY KEY,status text,payload jsonb,lease_until timestamptz,first_attempt_at timestamptz,ambiguous boolean DEFAULT false,lease_token uuid,attempts integer DEFAULT 0,sending_started_at timestamptz,error_kind text,last_error text);
  `);
  await db.exec(migration);
  await db.exec(readFileSync(new URL("../../drizzle/migrations/0008_email_intent_ignore_non_confirmation_updates.sql", import.meta.url), "utf8"));
  return db;
}

describe("atomic email intents (real migration, isolated database)", () => {
  it("an unrelated update of a pre-existing requested reservation does not replay its confirmation", async () => {
    const db = await setup();
    // Simulate a historical reservation that predates installation of the intent trigger.
    await db.exec(`ALTER TABLE manual_reservations DISABLE TRIGGER manual_reservations_enqueue_email_intent`);
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO manual_reservations(id,confirmation_requested) VALUES($1,true)`, [id]);
    await db.exec(`ALTER TABLE manual_reservations ENABLE TRIGGER manual_reservations_enqueue_email_intent`);
    await db.query(`UPDATE manual_reservations SET customer_name='same revision' WHERE id=$1`, [id]);
    expect((await db.query(`SELECT * FROM booking_email_intents`)).rows).toHaveLength(0);
    await db.close();
  }, 15000);
  it("paid online insert persists one intent; repeated paid status changes do not duplicate it", async () => {
    const db = await setup();
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO bookings(id,status) VALUES($1,'paid')`, [id]);
    await db.query(`UPDATE bookings SET status='active' WHERE id=$1`, [id]);
    const rows = (await db.query<{ source_id: string }>(`SELECT * FROM booking_email_intents`)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source_id).toBe(id);
    await db.close();
  });
  it("only requested manual revisions enqueue, and a later save cannot erase the prior snapshot", async () => {
    const db = await setup();
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO manual_reservations(id,customer_email) VALUES($1,'original@example.invalid')`, [id]);
    expect((await db.query(`SELECT * FROM booking_email_intents`)).rows).toHaveLength(0);
    await db.query(`UPDATE manual_reservations SET confirmation_requested=true WHERE id=$1`, [id]);
    await db.query(`UPDATE manual_reservations SET confirmation_requested=false,revision=2,customer_email='changed@example.invalid' WHERE id=$1`, [id]);
    const rows = (await db.query<{ snapshot: Record<string, unknown>; revision: number }>(`SELECT snapshot,revision FROM booking_email_intents`)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.revision).toBe(1);
    expect(rows[0]?.snapshot.customer_email).toBe("original@example.invalid");
    await expect(db.exec(`UPDATE booking_email_intents SET snapshot='{}'`)).rejects.toThrow("immutable");
    await db.close();
  });
  it("manual backoff and stale lease fencing prevent repeated sends or stale completion", async () => {
    const db = await setup();
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO manual_reservation_customer_mails(id,status,payload) VALUES($1,'pending','{}')`, [id]);
    const a = (await db.query<{ r: { lease_token: string } }>(`SELECT claim_customer_confirmation($1,60,82800) r`, [id])).rows[0]?.r;
    expect(a?.lease_token).toBeTruthy();
    const stale = (await db.query<{ ok: boolean }>(`SELECT fail_customer_confirmation($1,gen_random_uuid(),'invalid_key','401',false) ok`, [id])).rows[0]?.ok;
    expect(stale).toBe(false);
    await db.query(`SELECT fail_customer_confirmation($1,$2,'invalid_key','401',false)`, [id,a?.lease_token]);
    const result = (await db.query<{ r: { result: string } }>(`SELECT claim_customer_confirmation($1,60,82800) r`, [id])).rows[0]?.r;
    expect(result?.result).toBe("backoff");
    await db.close();
  });
});