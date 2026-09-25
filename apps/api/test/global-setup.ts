import { execSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { testDatabaseUrl } from './test-database';

// Runs once before all e2e tests: empties the test database, then creates it if needed and
// applies migrations. Every test file wipes it anyway; doing it first as well means rows left
// behind by an older checkout can never stop a new migration (e.g. a CHECK constraint).
export default async function globalSetup() {
  const url = testDatabaseUrl(); // refuses any database whose name doesn't end in _test
  await emptyTables(url);
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}

// Truncates every table except Prisma's migration history. Does nothing on a first run,
// before the database or its tables exist.
async function emptyTables(url: string) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      DECLARE tables text;
      BEGIN
        SELECT string_agg(format('%I', tablename), ', ') INTO tables
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
        IF tables IS NOT NULL THEN
          EXECUTE 'TRUNCATE ' || tables || ' CASCADE';
        END IF;
      END $$`);
  } catch (error) {
    // 3D000: the database doesn't exist yet (migrate deploy creates it below).
    if (!String(error).includes('3D000')) throw error;
  } finally {
    await prisma.$disconnect();
  }
}
