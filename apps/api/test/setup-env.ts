import { testDatabaseUrl } from './test-database';

// Runs before each e2e test file, before the app is created, so PrismaService
// connects to the test database instead of the development one.
process.env.DATABASE_URL = testDatabaseUrl();
