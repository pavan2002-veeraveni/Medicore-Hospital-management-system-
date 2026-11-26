-- =============================================================================
-- MediCore Migration 0002: PostgreSQL Exclusion Constraint, Append-Only Audit
-- & Read-Only Analytics Views
-- =============================================================================

-- 1. Enable btree_gist extension for combining equality (=) on UUID
--    with range overlap (&&) on tstzrange in a single GiST index.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Database-enforced appointment double-booking prevention.
--    Prevents overlapping active time slots for the same doctor even under
--    concurrent serializable/read-committed requests.
ALTER TABLE "appointments"
  DROP CONSTRAINT IF EXISTS "appointments_no_doctor_overlap";

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_doctor_overlap"
  EXCLUDE USING gist (
    "doctor_id" WITH =,
    tstzrange("scheduled_start", "scheduled_end", '[)') WITH &&
  )
  WHERE ("status" IN ('REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'));

-- 3. Check constraints for temporal & financial integrity
ALTER TABLE "appointments"
  DROP CONSTRAINT IF EXISTS "appointments_valid_time_range";

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_valid_time_range"
  CHECK ("scheduled_end" > "scheduled_start");

ALTER TABLE "invoices"
  DROP CONSTRAINT IF EXISTS "invoices_non_negative_amounts";

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_non_negative_amounts"
  CHECK ("subtotal" >= 0 AND "tax_amount" >= 0 AND "discount_amount" >= 0 AND "total_amount" >= 0 AND "paid_amount" >= 0);

-- 4. Append-only protection trigger for audit_logs (prevents UPDATE/DELETE)
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs table is append-only; % operations are prohibited', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "audit_logs_immutable_update" ON "audit_logs";
CREATE TRIGGER "audit_logs_immutable_update"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- 5. Controlled read-only analytical views (for Python FastAPI Analytics service)
CREATE OR REPLACE VIEW "vw_appointment_utilization" AS
SELECT
  a."department_id",
  d."name" AS "department_name",
  DATE(a."scheduled_start" AT TIME ZONE 'UTC') AS "appointment_date",
  a."type",
  a."status",
  COUNT(*)::int AS "appointment_count",
  AVG(EXTRACT(EPOCH FROM (a."scheduled_end" - a."scheduled_start")) / 60.0)::float AS "avg_duration_minutes"
FROM "appointments" a
LEFT JOIN "departments" d ON d."id" = a."department_id"
GROUP BY a."department_id", d."name", DATE(a."scheduled_start" AT TIME ZONE 'UTC'), a."type", a."status";

CREATE OR REPLACE VIEW "vw_waiting_times" AS
SELECT
  a."department_id",
  d."name" AS "department_name",
  a."id" AS "appointment_id",
  a."checked_in_at",
  e."started_at" AS "encounter_started_at",
  EXTRACT(EPOCH FROM (e."started_at" - a."checked_in_at")) / 60.0 AS "wait_minutes"
FROM "appointments" a
JOIN "encounters" e ON e."appointment_id" = a."id"
LEFT JOIN "departments" d ON d."id" = a."department_id"
WHERE a."checked_in_at" IS NOT NULL AND e."started_at" >= a."checked_in_at";

CREATE OR REPLACE VIEW "vw_lab_turnaround" AS
SELECT
  lt."category",
  lo."priority",
  lt."turnaround_hours" AS "target_hours",
  lr."is_abnormal",
  EXTRACT(EPOCH FROM (lr."resulted_at" - lo."ordered_at")) / 3600.0 AS "actual_hours"
FROM "lab_results" lr
JOIN "lab_order_items" loi ON loi."id" = lr."lab_order_item_id"
JOIN "lab_orders" lo ON lo."id" = loi."lab_order_id"
JOIN "laboratory_tests" lt ON lt."id" = loi."test_id";
