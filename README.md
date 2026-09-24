# Quizora

A simple quiz platform for a tutoring centre: teachers create timed multiple-choice quizzes,
students take them once within an open date range, and results are visible afterwards.

> **Status:** project foundation only (Phase 1). Authentication, quiz creation, the database
> schema, and scoring are not implemented yet — this commit sets up the monorepo skeleton so
> those can be built on top of it.

## Stack

- **Frontend:** Next.js + TypeScript (`apps/web`)
- **Backend:** NestJS + TypeScript (`apps/api`)
- **Database:** PostgreSQL, via Prisma (`apps/api/prisma`)
- **Auth:** JWT (not implemented yet)
- **Tests:** Jest + Supertest
- **Local dev:** Docker Compose (Postgres)

## Running locally

1. Copy each `.env.example` to `.env` (repo root, `apps/api`, `apps/web`) and adjust values if
   needed — they default to matching values, so this works out of the box.
2. Start Postgres: `docker compose up -d`
3. Install dependencies: `npm install` (run once, from the repo root — npm workspaces install
   both apps)
4. Run the apps:
   - Frontend: `npm run dev:web`
   - Backend: `npm run dev:api`

_TBD in a later phase: a single one-command startup, sample-data loading instructions, and
login credentials for a student/teacher/other user — none of that exists yet._

## Repository structure

```
apps/
  web/   Next.js frontend (own .env.example)
  api/   NestJS backend + Prisma schema (own .env.example)
docker-compose.yml   Local Postgres for development
.env.example          Postgres credentials for docker-compose
package.json          npm workspaces root
CLAUDE.md             Guidance for AI-assisted work on this repo
DECISIONS.md          Assumptions, scope cuts, and what's next
AI_USAGE.md           How AI tools were used on this project
```

## Documentation

- [`DECISIONS.md`](./DECISIONS.md) — assumptions made, what was added beyond the brief, what
  was left out, and what's next.
- [`AI_USAGE.md`](./AI_USAGE.md) — how AI tools were used on this project.
- [`CLAUDE.md`](./CLAUDE.md) — standing guidance for AI-assisted work in this repo.
