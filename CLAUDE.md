# CLAUDE.md

Guidance for AI agents (and humans) working on Quizora.

## Project purpose

Quizora is a small quiz platform for a tutoring centre (~300 students, 12 teachers, 3 classes).
Teachers author multiple-choice quizzes with a time limit and an open/close date range.
Students log in, take a quiz once within its open window, and see their score immediately.
Some quizzes apply negative marking for wrong answers; some don't — this is set per quiz by
the teacher who created it, not a global setting.

## Architecture

Monorepo (npm workspaces):

```
apps/
  web/   Next.js (TypeScript, App Router, Tailwind) — student & teacher UI
  api/   NestJS (TypeScript) — REST API, Prisma ORM, JWT auth
```

- `apps/api/prisma/schema.prisma` is the single source of truth for the database schema.
- PostgreSQL runs via `docker-compose.yml` for local development.
- The frontend never talks to the database directly — everything goes through the API.

## Stack

Next.js + TypeScript · NestJS + TypeScript · PostgreSQL · Prisma · JWT auth ·
Jest + Supertest (testing) · Docker Compose (local Postgres).

Do not introduce Supabase, Redis, message queues, or microservices. This is a small
practical system — keep the infrastructure proportional to that.

## Coding principles

- Keep the architecture simple. Don't add abstractions (services, layers, config flags)
  for requirements that don't exist yet.
- **Never trust the client for authorization or business rules.** Every rule that matters —
  who can attempt a quiz, whether an attempt is still within the time limit and date range,
  how a score is computed, whether negative marking applies — must be enforced and computed
  on the backend, even if the frontend also checks it for UX.
- Prefer a few extra explicit lines over a premature shared helper used by only one caller.
- Don't build features Nour didn't ask for without calling it out in `DECISIONS.md`.

## Testing expectations

Automated tests (Jest/Supertest) should prioritize backend business logic where a bug would
silently produce a wrong result or let something unauthorized happen, e.g.:

- Score calculation, including per-question points and negative marking.
- A student cannot attempt a quiz twice, or outside its open date range, or after time expires.
- Authorization: a student can't see another student's results; a teacher only sees their own
  quizzes' results (unless the brief later says otherwise).

## Security expectations

- JWT-based authentication; passwords hashed (never stored/logged in plaintext).
- Authorization checked on every relevant endpoint, not just hidden in the UI.
- Validate all input at the API boundary (DTOs / class-validator or equivalent).
- No secrets committed — `.env` is gitignored; `.env.example` documents required variables.

## Git workflow

- Commit as you go, in small focused commits — not one giant commit at the end.
- Never rewrite existing history (`.git` history so far is preserved as-is) and never change
  the `origin` remote without being asked.
- Don't bundle unrelated changes into one commit.

## AI usage expectations

- Be honest in `AI_USAGE.md` about which AI tools were used, how they were directed, and how
  the output was checked. This is read closely — do not understate or overstate AI involvement.
- AI-generated code is still reviewed by a human before it's committed.
