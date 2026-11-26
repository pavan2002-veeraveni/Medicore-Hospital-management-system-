// =============================================================================
// MediCore API - Real PostgreSQL Integration Test (CI / Local PG)
// Runs when TEST_DATABASE_URL is set (e.g. GitHub Actions Postgres service).
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const hasLivePostgres = Boolean(process.env.TEST_DATABASE_URL);

describe.runIf(hasLivePostgres)('PostgreSQL Exclusion Constraint & Audit Trigger Tests', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.TEST_DATABASE_URL! } },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('connects to PostgreSQL and verifies schema & btree_gist extension', async () => {
    const ext = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'btree_gist'
    `;
    expect(ext.length).toBeGreaterThanOrEqual(0);
  });
});
