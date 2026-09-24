import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './test-database';

// Runs once before all e2e tests: creates the test database if needed and applies migrations.
export default function globalSetup() {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'inherit',
  });
}
