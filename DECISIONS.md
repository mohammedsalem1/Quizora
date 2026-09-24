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

## Phase 5 — Teacher quiz management

### API

All routes require the TEACHER role and act only on the caller's own quizzes.

| Route | Purpose |
|---|---|
| `GET /classes` | Classes a quiz can be assigned to |
| `GET /teacher/quizzes` | The caller's quizzes, with question and attempt counts |
| `POST /teacher/quizzes` | Create a draft (title, description, dates, time limit, negative-marking %, classes) |
| `GET /teacher/quizzes/:id` | Full quiz including correct answers |
| `PATCH /teacher/quizzes/:id` | Change settings |
| `POST /teacher/quizzes/:id/questions` | Add a question with its options |
| `PUT /teacher/quizzes/:id/questions/:questionId` | Replace a question's text, points and options |
| `DELETE /teacher/quizzes/:id/questions/:questionId` | Remove a question |
| `POST /teacher/quizzes/:id/publish` | Check the quiz is complete, then publish it |

### Decisions

- **Options are saved together with their question** (no separate option endpoints). Every
  save must have 2–6 options with distinct texts and **exactly one** correct answer, so a
  half-built question can't exist. This is stricter than the Phase 2 plan, which only
  required "exactly one correct" at publish time. Publishing still re-checks it, as a
  safeguard.
- **Another teacher's quiz returns 404, not 403**, so a teacher can't learn whether a quiz
  exists. The owner always comes from the token; the body can't set `teacherId` or
  `publishedAt` (400).
- **Dates must include a timezone** (`Z` or `+03:00`). Without one, `09:00` would be read in
  the server's timezone, which isn't necessarily Amman's.
- **Limits:** time limit 1–300 minutes, 1–100 points per question, at most 100 questions per
  quiz, 1–20 classes per quiz, titles up to 200 characters.
- **Publishing** needs at least one question, at least one class, a closing date in the
  future, and every question valid. It lists every problem at once (409). Publishing twice
  is harmless. A published quiz can still be edited until a student starts it, but can't
  lose its last question.
- **The lock after the first attempt (approved in Phase 2) is enforced.** Adding, editing
  or deleting questions and changing the time limit or negative marking return 409. The
  title, description, dates and classes stay editable.
- **Edits and the first attempt can't overlap.** Every change locks the quiz's row
  (`SELECT … FOR UPDATE`) for the length of its transaction. Postgres makes an attempt
  insert, which references the quiz, wait for that lock and vice versa, so "no attempts
  yet" can't turn false halfway through an edit. Phase 8 gets this without extra code.

### Deliberately left out

- Deleting a quiz, unpublishing, and reordering questions. The brief doesn't ask for them.
  Each would be a small addition.

## Between Phases 5 and 6 — Web frontend for the current API

Built before Phase 6 at the user's request, so everything the API supports can be tested
end to end in a browser. It covers login and logout for both roles, routing by role, and full
teacher quiz management. The student area is a welcome page until Phases 6–9 add its API.

### Decisions

- **The login token lives in an httpOnly cookie that page JavaScript can't read.**
  - The browser only calls this app's own `/api/*` routes. `app/api/auth/login` logs in
    through the API and sets the cookie, and `app/api/[...path]` forwards everything else to
    the NestJS API with the token attached. The browser never sees the JWT, so an XSS bug
    couldn't steal it.
  - The API still does every authorization check; the forwarding route is only transport.
  - No CORS is needed. The earlier "CORS in Phase 7" note in the Phase 4 section is dropped.
  - CSRF: the cookie is `SameSite=Lax`, and requests that change data must be
    `application/json`, which another site can't send without CORS approval.
- **Who the user is gets decided on the server.** The `/teacher` and `/student` layouts ask
  the API (`GET /auth/me`) and redirect before rendering. A student who opens `/teacher`
  lands on `/student`. `proxy.ts` only sends visitors without a session cookie to
  `/login?from=…`, and the return path only accepts same-site paths.
- **The interface is in Arabic and right-to-left.** Quiz text, names and options use
  `dir="auto"`, so an English quiz still reads correctly. Dates show Arabic month names in
  the form used in Jordan (e.g. "8 تشرين الأول"), with Western digits.
- **Teachers enter dates in their browser's local time**, and they're sent to the API with
  an explicit timezone (ISO `…Z`), as the API requires.
- **API errors are translated.** The API answers in English. `lib/messages.ts` maps its fixed
  messages (publish problems, the lock, option rules…) to Arabic; anything unknown falls
  back to an Arabic message for the HTTP status.
- **The client mirrors the API's form rules** (for fast feedback). Each error appears at
  its field and focus moves to the first invalid one. The API remains the authority.
- **`API_URL` (server-only) replaces `NEXT_PUBLIC_API_URL`.** Only the Next.js server calls
  the API, so the address never needs to reach the browser.
- **Visual design:** one font family (IBM Plex Sans Arabic), cool paper-like neutrals and
  one green accent. The recurring motif is the answer-sheet bubble: the logo, and option
  letters أ ب ج د, with the correct one filled. Touch targets are at least 44px.

### Built beyond the brief (and why)

- **The login page arrived earlier than Phase 7**, as part of this frontend pass.

### Known limitations

- **Light theme only.**
- **No automated frontend tests.** The brief prioritises backend tests, and every rule is
  enforced (and tested) in the API. The UI was checked by driving a headless browser at a
  375px phone viewport and reviewing screenshots of each screen, plus horizontal-overflow
  and console-error checks.
- **The first build needs internet access**, to download the font (`next/font` then
  serves it from the app itself).
