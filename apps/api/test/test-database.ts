import 'dotenv/config';

// The e2e tests delete all data in the database they use, so they only ever run against
// TEST_DATABASE_URL, and only if its database name ends in "_test".
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set (see apps/api/.env.example)');
  }
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `TEST_DATABASE_URL points at "${dbName}"; e2e tests only run against a database whose name ends in _test`,
    );
  }
  return url;
}
