# Quizora API

The NestJS backend of Quizora: login, quizzes, attempts, scoring and results, with Prisma and
PostgreSQL. Setup, commands, the API reference and the architecture are in the
[root README](../../README.md); the reasoning behind them is in
[DECISIONS.md](../../DECISIONS.md).

Run commands from the repository root (`npm run dev:api`, `npm run test:api`, …). In this
folder:

| Path | What's in it |
|---|---|
| `.env.example` | The variables the API reads (copy to `.env`) |
| `src/` | The application: `auth/`, `quizzes/`, `attempts/`, `classes/`, `prisma/`, `common/` |
| `prisma/schema.prisma` | The database schema, the single source of truth |
| `prisma/migrations/` | Migrations, including the hand-written CHECK constraints |
| `prisma/seed.ts` | The demo data (`npm run db:seed`; deletes all data first) |
| `test/` | End-to-end tests (Jest + Supertest) against the `_test` database |
