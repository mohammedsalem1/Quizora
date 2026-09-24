# Decisions

This file tracks assumptions, scope decisions, and what's left for later — updated as work
progresses through each phase.

## Phase 1 — Project foundation

### Assumptions

- The brief's proposed stack (Next.js, NestJS, PostgreSQL, Prisma, JWT, Jest/Supertest,
  Docker Compose) is used as-is; no concrete reason was found to deviate.
- npm workspaces is sufficient for a two-app monorepo of this size — no need for pnpm,
  Turborepo, or Nx yet.

### Technical choices made during setup

- **Prisma 7.10.0, pinned.** npm's `latest` tag for `prisma` currently points at a
  prerelease (`8.0.0-rc.x`), so the version is pinned to the latest stable release. Prisma 7
  moves the connection URL out of `schema.prisma` into `apps/api/prisma.config.ts`, which
  reads `DATABASE_URL` from the environment.
- **One `.env.example` per place that reads it.** The root one holds the Postgres credentials
  `docker-compose.yml` uses; `apps/api/.env.example` holds `DATABASE_URL`/`JWT_SECRET`/`API_PORT`;
  `apps/web/.env.example` holds `NEXT_PUBLIC_API_URL`. Each app runs from its own directory,
  so a single root `.env` would not be picked up by the apps.
- Both generated apps keep their scaffold defaults (Turbopack for Next.js, Nest's stock
  `tsconfig.json`). Build failures during setup turned out to come from a corrupted
  `node_modules` after interrupted installs, not from the defaults; a clean install fixed them.
- `prisma init` also installs its own copy of Prisma's agent skills inside `apps/api`; those
  were removed since the repo keeps its skills at the root.

### Built beyond the brief (and why)

- Nothing yet. Phase 1 is deliberately just the skeleton — see `CLAUDE.md` for the "don't
  build things Nour didn't ask for" principle.

### Deliberately left out (for now)

- Authentication, users, roles.
- Quiz/question/attempt data model (Prisma schema has no models yet).
- Scoring, negative marking, timers, date-range enforcement.
- Dashboards / results views.
- Docker services for `web`/`api` themselves — only Postgres runs in Docker so far, since
  there's no application logic yet to containerize meaningfully.

### What's next

- Design the Prisma schema (users/roles, classes, quizzes, questions, options, attempts,
  answers) and get it reviewed before writing migrations.
- Implement JWT auth (student/teacher roles) enforced on the backend.
- Implement quiz creation (teacher) and quiz-taking (student) with server-side enforcement
  of: one attempt per student per quiz, time limit, open/close date range, per-question
  points, and per-quiz negative-marking flag.
- Seed script with realistic sample data (Arabic + Latin names, classes 10A/10B/11A,
  ~20 students each, 4 teachers, at least one Arabic-language quiz).
- Backend tests for the scoring/negative-marking/attempt-limit logic called out in
  `CLAUDE.md`.

## Phase 2 — Data model (reviewed and approved before implementation)

The schema is in `apps/api/prisma/schema.prisma`; the rules it can't express are raw SQL at
the end of the init migration (listed at the top of the schema file).

### Decisions

- **One `User` table with a `role`** (`STUDENT` / `TEACHER`). Students log in with a
  `username`, not an email — not every student has one. The role always comes from the
  database, never from the client.
- **Each student belongs to exactly one class**; teachers belong to none (a database CHECK
  enforces both directions).
- **A quiz can be assigned to several classes** (`QuizClass`). *Assumption:* any teacher can
  assign a quiz to any class — the brief doesn't link teachers to classes.
- **The teacher who creates a quiz owns it** (`Quiz.teacherId`); only they can edit it or see
  its results.
- **Negative marking is a per-quiz percentage** (`negativeMarkPercent`, 0–100, 0 = off). A
  wrong answer loses that percentage of *that question's* points, so the penalty scales with
  per-question points. Unanswered questions score 0. Scores are `Decimal(8,2)` because
  deductions can be fractional (25% of 1 point = 0.25).
- **A quiz's total score never goes below 0.** Individual wrong answers still deduct.
- **One attempt per student per quiz**, enforced by a unique index on
  `(quizId, studentId)`, so two simultaneous "start" requests can't both succeed. Starting
  the quiz uses up the attempt.
- **The timer lives on the server.** `expiresAt = min(startedAt + timeLimitMinutes, closesAt)`
  is fixed when the attempt starts — the closing date is a hard deadline. Answers are saved as
  the student picks them, so a refresh or reconnect resumes the same attempt. An attempt found
  past `expiresAt` is scored from its saved answers and marked `EXPIRED` on the spot (no
  background job).
- **Once any attempt exists, a quiz's questions, options, points, negative-marking
  percentage and time limit are locked**, and a quiz with attempts can't be deleted. Each
  answer also stores the points it earned (`pointsAwarded`).
- **Random UUIDs** for all IDs, so IDs can't be guessed or used to count records.
- **Safety-net CHECKs in the database**: `closesAt > opensAt`, `timeLimitMinutes > 0`,
  `negativeMarkPercent` 0–100, `points > 0`, class matches role, and a partial unique index
  allowing at most one correct option per question.

### Built beyond the brief (and why)

- **Draft → publish (`Quiz.publishedAt`).** Without it, a quiz whose opening date has passed
  becomes visible to students while the teacher is still adding questions. Publishing is also
  where the server will check the quiz is complete (at least one question; every question
  with at least two options and exactly one correct one).

### Deliberately left out

- Shuffling questions/options, multi-select questions, retakes, admin roles, linking teachers
  to specific classes, and date-range indexes (unnecessary at ~300 students).

## Phase 3 — Database implementation

- **Prisma 7 specifics.** The generated client goes to `apps/api/src/generated/prisma`
  (gitignored, regenerated by `postinstall`). It lives inside `src/` so `nest build` keeps
  emitting `dist/main.js`. It's generated as CommonJS with extensionless imports
  (`moduleFormat = "cjs"`, `importFileExtension = ""`) because the NestJS app, `ts-node` (seed)
  and `ts-jest` all load it as CommonJS. Prisma 7 also needs a driver adapter
  (`@prisma/adapter-pg`).
- **The hand-written constraints don't cause drift.** Comparing the live database with the
  schema produces an empty migration, so a future `prisma migrate dev` won't try to drop them.
- **Password hashing: `bcryptjs`** (pure JavaScript, no native build on Windows), needed now
  because the seed creates users. Phase 4 will use the same library to verify logins.
- **The seed wipes all tables and re-creates the sample data**, so it can be re-run. It
  refuses to run with `NODE_ENV=production`. It's intentionally smaller than the Phase 1 plan
  (3 teachers, 6 students per class instead of ~20); fuller demo data is Phase 14's job.
- **Local port clash (not committed, local only):** this machine also has a native
  PostgreSQL on 5432, so the local `.env` files point Docker Postgres at 5433 via
  `POSTGRES_PORT`. The committed defaults stay at 5432.

## Phase 4 — Authentication & roles

### Decisions

- **Secure by default.** A global guard requires a valid token on every endpoint unless it is
  explicitly marked `@Public()` (today: only `POST /auth/login` and the `GET /` health
  check). A new endpoint can't be left unprotected by forgetting a decorator.
- **The token only identifies the user.** Its payload is just the user id. The guard loads
  the user from the database on every request, so the role always comes from the database. A
  role claim inside a token is ignored, even if the token is correctly signed. Role changes
  and deleted accounts take effect immediately. At ~300 users one extra lookup per request is
  negligible.
- **Roles are declared per endpoint** with `@Roles('TEACHER')` / `@Roles('STUDENT')`, checked
  by a second global guard.
- **Tokens last 12 hours, with no refresh tokens.** A student who logs in in the morning
  isn't logged out mid-quiz. Logging out means the browser discards its token.
- **Usernames are case-insensitive** (trimmed and lowercased at login), because phone
  keyboards often capitalise the first letter. Stored usernames are lowercase.
- **Login failures don't reveal which usernames exist.** A wrong password and an unknown
  username get the same response, and an unknown username still runs a bcrypt comparison so
  the timing is similar.
- **Strict input validation everywhere.** A global validation pipe (registered in
  `AppModule`, so tests get the same behaviour) rejects unknown fields with a 400. That
  includes a client sending its own `role`.
- **Package versions:** `@nestjs/jwt` 11 and `@nestjs/config` 4, the generation that matches
  NestJS 11. The newer v12 packages are ESM-only (built for NestJS 12) and break under Jest.

### Assumptions

- **No self-registration.** The brief only says users log in, so accounts come from the seed
  for now. Known limitation: Nour has no screen for managing accounts.

### Testing approach

- API end-to-end tests (Supertest) run against a separate database from `TEST_DATABASE_URL`.
  Migrations are applied automatically. The tests delete all its data, so they refuse to run
  unless the database name ends in `_test`, and they double-check with
  `SELECT current_database()` before deleting anything.
- Role checks are tested through a small controller defined only inside the test file,
  because the real teacher/student endpoints arrive in Phase 5. Nothing test-only ships in
  the app.
- For Jest only, TypeScript compiles to plain CommonJS (`test/jest-e2e.json`). Prisma's
  generated client loads its query engine with a dynamic `import()`, which Jest's module
  runtime doesn't support without an experimental Node flag. The app's real build is
  unchanged.

### Deferred

- **Throttling repeated login attempts** → Phase 12 (security review).
- **Allowing the web app's origin (CORS)** → Phase 7, when the web app first calls the API.
- **Login page** → Phase 7.
