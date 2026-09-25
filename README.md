# Quizora

A simple quiz platform for a tutoring centre: teachers create timed multiple-choice quizzes,
students take them once within an open date range, and results are visible afterwards.

> **Status:** database, sample data, login with student/teacher roles, and quiz building for
> teachers work end to end, through the API and an Arabic, mobile-first web app (Phase 5).
> Students see which quizzes are open to them (Phase 6), and can start one, answer on their
> phone and submit, with the deadline enforced by the server (Phase 7). Expired attempts are
> recorded, and the database itself refuses a late submission (Phase 8). Scoring is not
> implemented yet.

## Stack

- **Frontend:** Next.js + TypeScript (`apps/web`)
- **Backend:** NestJS + TypeScript (`apps/api`)
- **Database:** PostgreSQL, via Prisma (`apps/api/prisma`)
- **Auth:** JWT (`POST /auth/login`, `GET /auth/me`)
- **Tests:** Jest + Supertest
- **Local dev:** Docker Compose (Postgres)

## Running locally

1. Copy each `.env.example` to `.env` (repo root, `apps/api`, `apps/web`) and adjust values if
   needed — they default to matching values, so this works out of the box.
2. Start Postgres: `docker compose up -d`
3. Install dependencies: `npm install` (run once, from the repo root — npm workspaces install
   both apps; this also generates the Prisma client)
4. Create the database tables: `npm run db:migrate`
5. Load sample data: `npm run db:seed` — **this deletes all existing data first.** Every
   sample account uses the password `Quizora@2026` (e.g. `teacher.rana`, `s10a01`).
6. Run the apps (two terminals):
   - Backend: `npm run dev:api` (http://localhost:3001)
   - Frontend: `npm run dev:web`, then open **http://localhost:3000**

The first `dev:web`/`build:web` downloads the Arabic font from Google Fonts, so it needs
internet access once.

_TBD in a later phase: a single one-command startup._

## Trying it out

Log in at http://localhost:3000 with a sample account (password `Quizora@2026` for all):

| Account | Role | What you'll see |
|---|---|---|
| `teacher.rana` | Teacher | A published Arabic maths quiz for 10A and 10B |
| `teacher.omar` | Teacher | A published English biology quiz for 11A |
| `teacher.huda` | Teacher | A draft Arabic grammar quiz, not yet published |
| `s10a01` … `s10a06`, `s10b01` … | Student (10A, 10B) | The maths quiz, open now |
| `s11a01` … | Student (11A) | The biology quiz, open now |

As a teacher: create a quiz (dates, time limit, negative marking, classes), add questions
and tap the letter of the correct answer, then publish. Other teachers can't open your
quizzes, and once a student starts a quiz its questions and scoring rules are locked.

As a student:
1. Open a quiz from the list and start it. There's one attempt, and the timer runs on the
   server.
2. Tap an answer for each question. Answers are saved as you tap.
3. Submit, or let the time run out.

The result page shows how many questions you answered. The score arrives with scoring in
Phase 9.

Starting a sample quiz locks its questions for the teacher. `npm run db:seed` resets
everything.

The browser only talks to the web app. The web app keeps the login token in an httpOnly
cookie and forwards `/api/*` requests to the NestJS API, which does every check.

## Tests

- Unit tests: `npm run test:api`
- API end-to-end tests: `npm run test:api:e2e`. These need Postgres running. They use a
  separate database (`TEST_DATABASE_URL` in `apps/api/.env`, created and migrated
  automatically) and **delete all data in it**, so they refuse to run unless its name ends
  in `_test`.

## Repository structure

```
apps/
  web/   Next.js frontend: pages in app/, /api/* route handlers that forward to the
         API, proxy.ts (login redirect), shared UI in components/ (own .env.example)
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
