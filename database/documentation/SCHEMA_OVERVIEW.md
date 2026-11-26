# MediCore Database Schema & Migration Overview

This directory mirrors the authoritative Prisma schema and SQL migrations located in `apps/api/prisma/`:

- `database/schemas/schema.prisma` — 32-entity PostgreSQL relational schema
- `database/migrations/20261126000001_init/migration.sql` — Initial schema DDL (tables, primary keys, foreign keys, unique indexes)
- `database/migrations/20261126000002_appointment_exclusion_and_views/migration.sql` — `btree_gist` exclusion constraint (`appointments_no_doctor_overlap`), temporal/financial CHECK constraints, append-only `audit_logs` trigger, and read-only analytical views (`vw_appointment_utilization`, `vw_waiting_times`, `vw_lab_turnaround`).

For full ER diagrams, index justifications, and transaction boundary documentation, see [docs/DATABASE_DESIGN.md](../../docs/DATABASE_DESIGN.md).
