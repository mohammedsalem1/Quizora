# Decisions

The **summary** below groups the project's decisions under the brief's headings. The
**[phase-by-phase log](#phase-by-phase-log)** after it records each decision in
detail: when it was made, the alternatives, and what went wrong along the way. The summary
names the phase to look under.

## Summary

### Assumptions

- **Accounts are created by the centre, not by sign-up.** The brief only says users log in,
  so there's no registration. Today the accounts come from the seed (Phase 4).
- **Students log in with a username, not an email**, because not every student has one.
  Usernames ignore letter case, since phone keyboards capitalise the first letter
  (Phases 2, 4).
- **Each student belongs to exactly one class; teachers belong to none.** Any teacher can
  assign a quiz to any class, because the brief doesn't link teachers to classes (Phase 2).
- **The teacher who creates a quiz owns it.** Only they can edit it or see its results
  (Phase 2).
- **Negative marking is a percentage of each wrong question's own points**, chosen per quiz
  by its teacher (0 = off):
  - A blank answer costs nothing.
  - A quiz total never goes below 0.

  The human chose the percentage form and the zero floor. A blank costing nothing was part
  of the AI's proposed design, which the human approved (Phases 2, 9).
- **"Student performance" means each student's result in each of the teacher's quizzes**,
  plus basic statistics. There are no cross-quiz reports, per "no unnecessary analytics"
  (Phase 10).
- **Dates follow the centre's location, Amman (given in the brief).** They're shown in the
  Jordanian Arabic form ("8 تشرين الأول") with Western digits. Teachers enter dates in their
  browser's local time, assumed to be the centre's (web frontend section).
- **The scale is small:** about 300 students and 12 teachers. So there's one API process and
  one database, no pagination, no caching, and in-memory login throttling (Phases 6, 12).
- **The brief's stack is used as given**, with no Redis, queues or microservices (Phase 1).
  One small exception: the web app's unit tests use Node's built-in test runner instead of
  Jest, to avoid adding dependencies (Phase 13).

### Important design decisions

**Security**
- **The browser never sees the login token.**
  - The web app keeps the token in an httpOnly, `SameSite=Lax` cookie and forwards `/api/*`
    requests to the API.
  - Requests with a body must be JSON, which a cross-site page can't send (nor a DELETE)
    without CORS approval. No CORS is needed, so none is given.
  - Phase 12 closed three gaps in this design: a token leak through `/api/Auth/login`,
    cross-site logout, and an open redirect after login.
  - See the web frontend section and Phase 12.
- **Secure by default.**
  - Every API route needs a valid token unless it's marked public.
  - The token carries only the user id. The role is read from the database on every
    request, so a changed role or a deleted account takes effect at once.
  - See Phase 4.
- **Other people's things look nonexistent.** Another teacher's quiz, or a quiz a student
  can't see, returns 404, not 403 or 409, so its existence isn't revealed (Phases 5, 6, 13).
- **Strict input.**
  - Unknown fields are rejected.
  - Dates must carry a timezone and be real calendar dates.
  - NUL characters are refused.
  - Bodies are limited to 100 KB.
  - See Phases 4, 5 and 12.
- **Password guessing is slowed per username.** After 5 failures, each new try waits 1, 2, 4
  … up to 30 seconds. It's keyed on the username because the whole centre probably shares
  one IP (deferred in Phase 4, built in Phase 12).

**Quizzes**
- **Draft, then publish.** Publishing checks the quiz is complete, and students never see a
  draft (Phases 2, 5).
- **A question is saved with its options,** always 2–6 of them with exactly one correct
  answer, so a half-built question can't exist (Phase 5).
- **Once a student starts a quiz, its scoring rules are locked:** the questions, points,
  negative marking and time limit.
  - The title, description, dates and classes stay editable.
  - Edits and a first start lock the quiz row, so they can't interleave (Phases 2, 5, 6).

**Attempts and the timer**
- **One attempt per student per quiz,** enforced by a unique index. Two simultaneous starts
  end up in the same attempt (Phases 2, 7).
- **The server's clock decides everything.** An attempt's deadline is the time limit, cut
  short by the quiz's closing time, and it's fixed when the attempt starts.
  - The human chose that a later change to the closing date doesn't move the deadline of an
    attempt already running (Phase 6).
- **Answers are saved as they're tapped,** one at a time under the attempt's row lock.
  - Nothing is accepted after the deadline or after a submit, and there's no grace period.
  - The page's countdown errs on the early side (Phases 7, 8).
- **Expiry is recorded lazily.** An attempt whose time ran out is ended and scored the next
  time the student or the teacher looks. There's no background job (Phases 2, 8, 9, 10).

**Scoring and results**
- **A score is computed only when an attempt ends,** in one function
  (`finalizeAttempt`). It counts in whole hundredths of a point, so there's no rounding
  (Phase 9).
- **Students see only their own score, and only after they finish.**
  - Students are never shown the correct answers.
  - Teachers see totals per question, not each student's choices.
  - See Phases 7, 9 and 10.
- **The database is the last line of defence.** Its CHECK constraints and unique indexes
  refuse:
  - a submission after the deadline
  - a finished attempt without a score
  - a score outside 0 to the maximum
  - a second attempt
  - a second correct option

  See Phases 2, 8 and 9.

**Interface**
- **Arabic and right to left, built for phones.**
  - Quiz content uses `dir="auto"`, so English quizzes read correctly.
  - API errors are translated into Arabic.
  - It was checked at 375px and 320px widths, for contrast, and with screen readers in mind
    (web frontend section, Phase 11).
- **Saving answers survives a phone network.**
  - A lost response is retried, not undone, and the server always ends with the last tap.
  - Submitting waits for saves still in flight (Phase 7).

**Project**
- **An npm workspaces monorepo:** the NestJS API and the Next.js web app. Only Postgres runs
  in Docker (Phase 1).
- **Setup is one command after `npm install`:** `npm run setup`. Then `npm run dev` starts
  both apps (Phase 15).

### Things intentionally omitted

- **Account management:** sign-up, password reset, and screens for adding students or moving
  them between classes (Phases 2, 4).
- **Quiz-editing extras:** deleting a quiz, unpublishing, and reordering questions (Phase 5).
- **Question variety:** shuffled questions or options, and multi-select questions (Phase 2).
- **Retakes, and a grace period after the deadline** (Phases 2, 7, 8).
- **Showing correct answers after a quiz, and per-student answer review for teachers**
  (Phases 7, 10).
- **Analytics:** exports, charts and trends across quizzes (Phase 10).
- **Pagination,** unnecessary at this scale (Phase 6).
- **Infrastructure:** background jobs, Redis, queues and microservices, per the brief. Also
  Docker images and deployment configuration for the two apps (Phases 1, 2).
- **Refresh tokens and server-side logout.** A token lasts 12 hours (Phases 4, 12).
- **Interface extras:** a dark theme, and one question per screen (web frontend section,
  Phase 7).

### Features built beyond the brief, and why

- **The draft and publish step:** without it, a quiz whose opening date had passed would be
  visible while its teacher was still writing it (Phase 2).
- **Clearing an answer:** when wrong answers cost points, a student must be able to take a
  guess back (Phase 7).
- **A login throttle:** without it, passwords could be guessed online without limit. It was
  deferred in Phase 4 and built in the Phase 12 security review (Phases 4, 12).
- **Web unit tests** for the security helpers the web app enforces itself, using Node's
  built-in runner with no new dependencies (Phase 13).
- **A demo at the brief's real size, with past results,** so every screen can be seen
  populated straight after setup (Phase 14).
- **`npm run setup` and `npm run dev`:** the brief allows "one-command or clear local setup",
  and a single command is the more reliable path for a reviewer on a fresh machine
  (Phase 15).

### Known limitations

- **No account management.** Nour can't add or move students from the app. Today that means
  editing the database or the seed (Phase 4).
- **An answer that never reaches the server is lost.** If a phone stays offline until the
  time runs out, the answers it couldn't send don't count. The page shows them as "not saved
  yet, retrying" (Phase 7).
- **Logging out doesn't revoke the token.** It's forgotten by the browser but stays valid
  for its 12 hours (Phase 12).
- **The login throttle lives in the API's memory.** A restart forgets it, and it only works
  with one API process. Someone who mistypes a classmate's username can make them wait up to
  30 seconds (Phase 12).
- **Any teacher can see a class's student list,** by assigning a quiz to it, because
  teachers aren't linked to classes (Phase 12).
- **Deeply nested JSON gives a 500,** a framework limit with no effect beyond a log line
  (Phase 12).
- **No security headers** such as `X-Frame-Options`. They're better set at deployment
  (Phase 12).
- **Teacher edit routes lock a quiz row before checking its owner.** Another teacher could
  briefly delay students starting it, but only if they knew its id, which is never shown to
  them (Phase 12).
- **Some code has no automated tests:**
  - The pages, which were checked with headless-browser scripts and `curl`. The security
    helpers they use are unit-tested.
  - The web login route's cookie handling (Phases 7, 11, 12, 13).
  - The seed, which was checked against a scratch database instead (Phase 14).
- **Accessibility gaps:**
  - English quiz content is read with the Arabic screen-reader voice.
  - Focus doesn't move to the confirmation after saving in the teacher's editor
    (Phase 11).
- **Light theme only** (web frontend section).
- **The first start needs Google Fonts.** The first build or start downloads the Arabic
  font. In the Phase 15 fresh-clone test the download timed out once, and every page
  returned 500. Restarting the web app with its `.next` folder deleted fixed it (web
  frontend section, Phase 15).
- **The demo's dates are relative to the day the seed runs,** so the seed should be re-run
  before a demo (Phase 14).
- **The demo quizzes are short:** 2 to 8 questions, where the brief says a quiz usually has
  about 15. A reviewer can take one in a few minutes, and the app itself allows up to 100
  questions. This wasn't a stated choice in Phase 14; the Phase 16 review noticed it.
- **The teacher results page lists every student on one page.** With 200 students that's a
  long scroll on a phone. There's no filter or search (Phase 16).
- **`npm run setup` and `npm run dev` were tested on Windows only.** They use only Node and
  Docker commands, so they should work the same on macOS and Linux, but that wasn't checked
  (Phase 15).
- **`npm run dev:web` on its own doesn't fix its port.** If 3000 is taken, Next.js moves to
  the next free port, which can be the API's 3001. `npm run dev` fixes the port. Pinning it in
  the web app's own scripts, with clearer errors when the API can't be reached, is the
  separate login-failure fix the human asked to keep on its own branch (web frontend
  section).

### Possible next-week improvements

In order of value to the centre:

1. **Account management for Nour:** an admin role, adding students and teachers (or
   importing a class list from a spreadsheet), moving students between classes, and
   resetting passwords.
2. **Deployment:**
   - Dockerfiles for the API and the web app, and HTTPS
   - security headers
   - a managed `JWT_SECRET`
   - database backups
3. **Teacher conveniences:**
   - duplicating, deleting or unpublishing a quiz
   - reordering questions
   - exporting results to a spreadsheet
   - reviewing each student's answers
   - filtering the results page by class, and searching it by name
4. **Offline safety for answers:** keep unsent answers in the browser, and send them when
   the connection returns, if the attempt is still running.
5. **Browser end-to-end tests** (for example Playwright) for the student and teacher flows,
   replacing the one-off headless scripts.
6. **Self-host the Arabic font** (`next/font/local`, it's openly licensed), so a fresh setup
   doesn't depend on reaching Google Fonts.
7. **After a quiz closes,** optionally show students the correct answers.
8. **If the API ever runs as more than one process:** a shared login throttle, and token
   revocation on logout.

---

# Phase-by-phase log

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
  `apps/web/.env.example` holds `NEXT_PUBLIC_API_URL` (later replaced by the server-only
  `API_URL`; see the web frontend section). Each app runs from its own directory, so a single
  root `.env` would not be picked up by the apps.
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
  *Later dropped: the web app calls the API from its own server, so CORS isn't needed (web
  frontend section).*
- **Login page** → Phase 7. *Built earlier, in the web frontend section.*

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
  yet" can't turn false halfway through an edit. *Corrected in Phase 6:* this alone isn't
  enough. Starting an attempt also has to lock the quiz row before it reads the quiz (see
  Phase 6).

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
  - *Phase 12 found and fixed three gaps in this design:*
    - *a case-changed `/api/Auth/login` path returned the raw token*
    - *logout accepted a cross-site form*
    - *a tab character got past the return-path check*
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
  and console-error checks. *Corrected in Phase 13: the web app enforces a few security
  rules itself, and those now have unit tests.*
- **The first build needs internet access**, to download the font (`next/font` then
  serves it from the app itself).

## Phase 6 — Quiz availability

### API

Both routes require the STUDENT role.

| Route | Purpose |
|---|---|
| `GET /student/quizzes` | The quizzes this student can see, latest opening date first, each with its state |
| `GET /student/quizzes/:id` | One of them, with the same fields |

Each quiz includes its title, description, dates, time limit, negative-marking percentage,
number of questions, total points and `state`. Questions, options and correct answers are
never included. The student gets the questions only when they start the quiz (Phase 7).

### Decisions

- **The rule is one function**, `quizAvailability()` in `apps/api/src/quizzes/availability.ts`,
  and it has its own unit tests. The endpoint that starts a quiz (Phase 7) must call the same
  function, so what the list shows and what the server allows can't drift apart.
- **States:**

  | State | Meaning |
  |---|---|
  | `NOT_OPEN_YET` | Assigned and published, but before its opening time |
  | `AVAILABLE` | The student can start it now |
  | `IN_PROGRESS` | The student's attempt is still running, so they can resume it |
  | `FINISHED` | The student's attempt was submitted or its time ran out. There's no second attempt |
  | `CLOSED` | It closed and the student never started it |

- **A quiz is open while `opensAt ≤ now < closesAt`.** At exactly the closing time it's
  closed. An attempt's time is up at exactly its `expiresAt`.
- **A previous attempt is checked first.** Once a student has started a quiz, it stays
  visible to them (`IN_PROGRESS` or `FINISHED`), even if the teacher later removes their
  class from it. That way they can still resume it, and later see their result. A student
  who hasn't started it sees it only while their class is assigned.
- **An attempt still marked `IN_PROGRESS` after its `expiresAt` shows as `FINISHED`.** Marking
  it `EXPIRED` and scoring it happen on the next request that touches it (Phases 8–9, with no
  background job, as decided in Phase 2). The state shown doesn't wait for that.
- **Quizzes a student can't see return 404, not 403.** A draft, another class's quiz and a
  nonexistent ID all look the same, as with teachers' quizzes in Phase 5. A malformed ID
  returns 400.
- **Everything is decided on the server with the server's clock.** The client sends neither
  the time nor its class, and the rule doesn't depend on what the frontend shows.
- **Starting a quiz (Phase 7) must lock the quiz row before reading it.** This corrects the
  Phase 5 note.
  - The insert's foreign-key lock arrives only at the insert. Before inserting, the start
    endpoint reads the quiz: its availability, and the time limit and closing date it
    computes `expiresAt` from.
  - A teacher's edit could commit between that read and the insert. The attempt would then
    start from the old time limit, while the quiz shows the new one and is locked.
  - So the start must run `SELECT … FOR SHARE` on the quiz row at the beginning of its
    transaction, before those reads. It waits for any edit's `FOR UPDATE` (and edits wait
    for it), while starts by different students don't block each other.

### Deliberately left out

- Student pages (Phase 7). This phase adds the rule and the two read-only routes.
- Pagination. At ~300 students and 12 teachers, a student's list stays short.

### Decided after review: changing the closing date after students have started

- **An attempt's deadline is a snapshot taken when the attempt starts:**
  `expiresAt = min(startedAt + timeLimitMinutes, closesAt)`.
  - If the teacher later changes `closesAt`, deadlines of attempts that have already started
    are **not** recalculated, whether the date moves earlier or later.
  - Students who start after the change use the new `closesAt`.
- **Example:** the time limit is 20 minutes and the quiz closes at 10:00.
  - A student starts at 09:55, so their attempt expires at 10:00.
  - The teacher then moves the closing time to 10:30. That attempt still expires at 10:00.
  - A classmate who starts at 10:05 gets until 10:25.
- **This is the contract for Phases 7–8.** The start endpoint computes `expiresAt` once, and
  nothing updates it afterwards.
- The human chose this over the two alternatives: recalculating running attempts when the
  date changes, or refusing closing-date changes once attempts exist.

## Phase 7 — Student quiz flow

**Scope, agreed with the human before building:**
- **Phase 7:** the whole flow, with the server enforcing the deadline.
- **Phase 8:** marking expired attempts in the database, behaviour on reconnect, and race
  and edge-case tests.
- **Phase 9:** scoring. Until then `score` is `null`.

### API

Every route requires the STUDENT role. A student has at most one attempt per quiz, so the
attempt is addressed by its quiz. Whose attempt it is always comes from the login.

| Route | Purpose |
|---|---|
| `POST /student/quizzes/:id/attempt` | Start the attempt, or resume it if it's still running |
| `GET /student/quizzes/:id/attempt` | The attempt: status, deadline, server time; plus questions and saved answers while it runs |
| `PUT /student/quizzes/:id/attempt/answers/:questionId` | Save or change an answer (`{ "optionId": … }`) |
| `DELETE /student/quizzes/:id/attempt/answers/:questionId` | Clear an answer |
| `POST /student/quizzes/:id/attempt/submit` | Submit |

### Decisions

- **Starting a quiz follows the Phase 6 rules.**
  - It first locks the quiz row with `SELECT … FOR SHARE`, so it can't interleave with a
    teacher's edit.
  - It then checks the quiz with the same `quizAvailability()` the list uses.
  - The deadline is computed once, as agreed.
  - Starting again resumes the same attempt.
  - If the same student starts twice at the same moment, the unique index lets one insert
    through, and the other request resumes that attempt.
- **Error codes:**
  - 409 when the quiz is visible but the action isn't allowed now: it isn't open yet, it's
    closed, or the student already took it.
  - 404, as in Phase 6, when the student can't see the quiz, or has no attempt on it.
- **Answers are saved one at a time per attempt.**
  - Each save and the submit lock the attempt row (`FOR UPDATE`), so nothing can be saved
    after the attempt is submitted.
  - The deadline is checked with the server's clock, read after the lock is taken.
  - The question must belong to the quiz (404), and the option to the question (400).
  - Students can clear an answer. That matters when wrong answers cost points.
- **Submitting is repeatable.** A second submit returns the same result. That covers double
  taps and lost responses, even after the deadline, as long as the first submit was in time.
  A first submit after the deadline gets 409.
- **The status a student sees is the effective one.** An attempt past its deadline shows as
  `EXPIRED`, even though its row still says `IN_PROGRESS` until Phase 8 writes it.
- **Questions go out only while the attempt runs.** Correct answers never do, not even after
  submitting: nobody asked for that, and classmates may still be taking the quiz. What results
  show is Phase 10's decision.
- **All time decisions use the API server's clock.**
  - `startedAt` is set by the API, not by the database default.
  - Every deadline check uses the API's clock.
  - On this machine, the Docker database's clock ran about 75 seconds ahead of Windows.
    Mixing the two clocks would have given every attempt 75 extra seconds.
- **No grace period.** An answer that reaches the server after the deadline is refused. The
  page's countdown errs on the early side (below). Phase 8 can revisit this.
- **Note for Phase 9:** `score` and `pointsAwarded` are `Decimal` columns, which Prisma sends
  as strings in JSON. The response should convert them to numbers, since the web app expects
  `number | null`.

### Student pages (web)

- **Pages:**
  - My quizzes, grouped into available now, upcoming and past.
  - Quiz details. Starting needs a confirmation that there is one attempt and that the timer
    can't be paused.
  - The quiz page.
  - The result: how many questions were answered, and the score once Phase 9 adds it.
- **The quiz page is one scrolling page.** A sticky bar shows the countdown and "answered X of
  Y". Each option is a native radio button drawn as an answer-sheet bubble, and screen readers
  also hear its letter.
- **Saving answers on a phone network** (`lib/useAnswerSync.ts`, reworked after two reviews):
  - Each question has at most one request in flight. When it finishes, the latest tap is
    sent, so the server always ends with the student's last choice.
  - A lost response (offline, 502, 5xx) is retried, not undone, because the answer may have
    been saved. After a lost response, the latest choice is sent again even if it matches
    the last confirmed one.
  - Only a definite refusal (4xx) puts the question back to what the server confirmed.
    A 409 means the attempt is over, so the page goes to the result page.
  - Submitting waits until every save has finished.
  - Leaving the page with an unsaved answer asks for confirmation. When the app itself sends
    the student to the login page, it doesn't ask.
  - When the phone wakes up, the page checks the server. It never overwrites a question that
    changed after that check was sent.
- **The countdown:**
  - The page measures the server's clock from before its request, so network delay makes
    it show a little less time, never more.
  - It's recomputed from the clock every second, so it stays right after the phone sleeps.
  - At zero, the page lets saves in flight finish, asks the server, and then moves to the
    result page.
- **Automatic moves replace the current page in the history**, so the back button never
  bounces between the quiz and its result.

### Deliberately left out

- **Phase 8:** marking expired attempts in the database and reconnect/race tests.
- **Phase 9:** the score.
- **Not in the brief:** showing correct answers after submitting, one question per screen,
  and a grace period after the deadline.

### Known limitations

- **An answer that never reaches the server is lost.** If the phone stays offline until the
  time runs out, answers it tapped but couldn't send don't count. Each such question shows
  "not saved yet, retrying" while the page keeps trying.
- **No automated frontend tests**, as in the frontend pass before Phase 6. The pages were
  checked in a headless browser (see `AI_USAGE.md`).

## Phase 8 — Timer & attempt protection

Most of the brief was already in place after Phase 7: a deadline set by the server, one
attempt per student, and refusing late answers and submissions. Phase 8 records expiry in the
database, adds database safety nets, and tests the edge cases.

### Decisions

- **Expired attempts are recorded when the student next makes a request.**
  - Every student request about quizzes or attempts first runs one conditional
    `UPDATE`, using the API's clock. It marks that student's overdue `IN_PROGRESS` attempts
    as `EXPIRED`. There's no background job (Phase 2).
  - It can't overwrite a submission. A submit and this update both need the row lock, and
    Postgres re-checks `status = IN_PROGRESS` after waiting, so an attempt submitted in time
    stays `SUBMITTED`.
  - Until then the row may still say `IN_PROGRESS`. Everything a student sees already uses
    the effective status, so nothing depends on when the row catches up.
- **Database safety nets.** A new migration, `*_attempt_checks`, adds three CHECKs:
  - the deadline is after the start
  - the status is `SUBMITTED` exactly when `submittedAt` is set
  - `submittedAt` is before the deadline, so even a bug in the API couldn't store a late
    submission

  Apply it to the development database with `npm run db:migrate`. The tests apply it
  automatically.
- **What enforces each rule in the brief:**

  | Rule | Enforced by |
  |---|---|
  | A student can't take the same quiz twice | The unique `(quizId, studentId)` index; a start refuses a finished attempt (409); two simultaneous starts resume the one attempt |
  | An expired attempt can't be submitted normally | The server-clock check under the attempt's row lock (409), and the `submittedAt < expiresAt` CHECK |
  | The client can't extend the timer | The deadline is computed by the server at start and never recalculated; a start ignores its body; answer bodies reject unknown fields; the page's countdown is display only |
  | Refresh and reconnect behave the same way | The attempt is found by quiz and student; starting again resumes it with the same deadline and saved answers; the page re-checks when the phone wakes (Phase 7) |
  | Nothing is saved after submitting | Answer saves and the submit take the attempt's row lock one at a time (tested in both orders) |

- **Test data is now realistic.** Fixtures start an attempt before its deadline and submit it
  before the deadline. The helper that makes the time run out moves the whole attempt into
  the past, instead of only its deadline.
- **The e2e setup empties the test database before migrating it.** Before this, rows left
  by an older checkout (such as Phase 7's unrealistic test rows) would have made the new
  CHECKs fail to apply and blocked every test run.
  - The setup truncates every table except Prisma's migration history, then runs
    `migrate deploy` as before. Every test file already wipes the database at its start;
    this only does it earlier.
  - It is still limited to databases whose name ends in `_test`.
  - `prisma migrate reset` was not used, because Prisma refuses to run it for an AI agent
    without the user's explicit consent. That would have stopped every agent-run test.

### Left for later phases

- **Phase 9:** score the attempt at the two points where it ends, the submit and this expiry
  step. The expiry step is a single `updateMany` today, so Phase 9 will need to score each
  attempt it expires.
- **Phase 10:** teacher-side results must run the same expiry step for a quiz's attempts
  before reading them, since a student who never comes back never triggers it.

### Deliberately left out

- **A grace period after the deadline.** The brief doesn't ask for one, and the page's
  countdown already errs on the early side.
- **A database trigger blocking answers after a submission.** The row lock already makes the
  two happen one at a time, and that is tested.

## Phase 9 — Scoring & negative marking

### How a score is calculated

The rules were agreed in Phase 2. The code is `scoreAttempt()` in
`apps/api/src/attempts/scoring.ts`.

| Answer | Points |
|---|---|
| Correct | + the question's points |
| Wrong, negative marking off (0%) | 0 |
| Wrong, negative marking on (p%) | − p% of **that question's** points |
| Unanswered | 0, even with negative marking |

- **The quiz total never goes below 0.** Wrong answers still count against correct ones: +3
  and −0.5 gives 2.5. The floor only applies to the final total.
- **Example:** a quiz with 25% negative marking and questions worth 2 and 3 points. Question
  1 right and question 2 wrong gives 2 − 0.75 = **1.25** out of 5.
- **Negative marking is set per quiz by its teacher** (0–100%, 0 = off), not globally.

### Decisions

- **No rounding.** Points and the percentage are whole numbers, so every penalty (points ×
  percent / 100) has at most two decimals. The server counts in whole hundredths of a point,
  so the arithmetic is exact, and results are stored as `Decimal(8,2)`. A quiz can total at
  most 100 questions × 100 points, which fits.
- **A score is computed only when an attempt ends,** in `finalizeAttempt()`, whether the
  student submits or the time runs out.
  - It writes the status, `score`, `maxScore` and each answer's `pointsAwarded` in the same
    locked transaction.
  - The expiry step from Phase 8 now scores each overdue attempt in its own transaction,
    after re-checking under the row lock that it is still running. Every finished attempt is
    therefore scored exactly once.
- **The server is the only source of a score.** Request bodies can't set one; a test submits
  a fake score and checks it's ignored. The score comes from the answers saved on the server
  and the correct options stored with the quiz.
- **Students see only their own score, and only once the attempt has ended.** Responses
  never include `pointsAwarded`, correct answers or per-question results. The result page
  shows the score out of the maximum and states the quiz's negative-marking rule.
- **Database safety nets.** A new migration, `*_attempt_score_checks`, adds two CHECKs:
  - A finished attempt has a score and a maximum, and a running one has neither.
  - `0 ≤ score ≤ maxScore`.

  They're added `NOT VALID`: Postgres enforces them on every new write, but not on rows that
  already exist. So attempts that finished before scoring existed (only in development
  databases) keep a null score and show "not calculated". Apply the migration with
  `npm run db:migrate`.

### Left for later phases

- **Phase 10:** teacher-side results and statistics. Those need the same expiry step for a
  whole quiz before reading scores, as noted in Phase 8.

## Phase 10 — Results & teacher dashboard

### API

| Route | Who | Purpose |
|---|---|---|
| `GET /teacher/quizzes/:id/results` | The teacher who owns the quiz | Every student the quiz is for, their status and score, plus basic statistics |
| `GET /student/quizzes` and `/:id` (Phase 6) | Students | Now also include the student's own `score` and `maxScore` once they have finished |

### Decisions

- **Only the owner sees a quiz's results.** Another teacher gets 404 (as in Phase 5), a
  student gets 403, and ownership is checked before anything else runs.
- **Results are complete when the teacher opens them.** The route first ends and scores any
  of the quiz's attempts whose time is up. This closes the gap from Phases 8–9: a student
  who never came back used to keep an unscored attempt.
- **Who is listed:**
  - Every student in the quiz's classes, including those who haven't started.
  - Anyone who started before the teacher removed their class, since their attempt still
    counts (the Phase 6 rule).
  - Students of other classes are never listed.
- **"Student performance" means each student's result in each of the teacher's quizzes:**
  - their status (not started, in progress, submitted, time up)
  - their score out of the maximum
  - how many questions they answered
  - when they finished

  There are no cross-quiz reports or charts, since the brief asks for basic statistics and
  "no unnecessary analytics".
- **The statistics shown:**
  - how many students are in each status
  - the average, highest and lowest score, over finished attempts that have a score
  - for each question, how many finished attempts got it right, got it wrong, or left it
    blank. Attempts still in progress don't count yet.

  Only the average is rounded, to the nearest hundredth. The rest are exact.
- **Teachers see totals, not individual answers.** The response never includes option
  choices, correct answers or `pointsAwarded`.
- **Students see only their own score, and only once they've finished.** It appears in their
  quiz list, on the quiz page and on the result page. Classmates' scores are never included.

### Deliberately left out

- **Per-student answer review for teachers** (which option each student picked). Nobody
  asked for it, and it would be a small addition.
- **Exports, charts and trends across quizzes**, per "no unnecessary analytics".

## Phase 11 — Arabic & mobile UX

The interface was already Arabic, right-to-left and built for phones. This phase audited it
at 375px and 320px (small phones) and fixed what fell short of the brief.

### Decisions

- **Every page has its own title**, for example "نتيجة الاختبار | Quizora". Screen readers
  announce a page change only when the title changes, and before this every page was
  titled "Quizora".
- **Focus follows what the student is doing.**
  - Opening or cancelling the start and submit confirmations moves focus to the
    confirmation, or back to the button.
  - "مسح الإجابة" moves focus to the question's options, since the button itself disappears.
  - The forms render their errors before moving focus to the first invalid field, so the
    error is read out with the field.
- **Contrast** now meets WCAG AA:
  - Busy buttons ("جارٍ حفظ الإجابات…") use a grey background with white text (5.8:1).
  - Input borders are dark enough to find (3.8:1).
- **Small phones:**
  - Long unbroken words wrap instead of widening the page (`overflow-wrap: anywhere`).
  - Buttons never break inside a word.
  - Below 360px, the header shows only the logo's bubbles, so the user's name fits.
  - Label and value pairs stack.
  - A time stays together with its "ص/م".
- **Right-to-left details:**
  - Each class name in a list is isolated on its own, so "10A، 10B" reads in the right order
    with the comma on the right side. The class picker no longer forces left-to-right.
  - The teacher results page numbers questions 1, 2, 3 like every other screen, instead of
    by stored position, which has gaps after a deletion.
- **Arabic counts** use `Intl.PluralRules("ar")`, so 100 and 103–110 take the right noun
  form ("100 سؤال", "105 دقائق").
- **The timer is clearer.** In the last 5 minutes the time sits on an amber background, and
  in the last minute on a red one. Screen readers already announced both moments. On small
  phones the timer bar never wraps.
- **Also fixed:**
  - Back links meet the 44px touch target.
  - The zero-floor rule ("the quiz score never goes below zero") is stated before and during
    the quiz, not only on the result page.
  - The teacher's question preview keeps line breaks.
  - The results page says "أجاب عن N من M", and no longer claims "nobody finished" when
    attempts exist that have no score.

### Deliberately left out

- **Reading English quiz content with the English screen-reader voice** (`lang="en"`). It
  needs detecting each text's language, and the quiz is still usable without it.
- **Moving focus after saving in the teacher editor.** The confirmations appear, but focus
  isn't moved to them.

## Phase 12 — Security & edge cases

This phase tried to break the application the way someone skipping the web app would. Four
read-only reviews each took one area:
- login, tokens, the session cookie and the web proxy
- authorization across every route
- input validation and malformed requests
- the business rules (attempts, timer, score)

Every claimed issue was reproduced, with a failing test or a real request, before it was
fixed. `apps/api/test/security.e2e-spec.ts` walks through the brief's list as executable
attacks.

### Fixed (real issues)

| Issue | Fix |
|---|---|
| Passwords could be guessed online without limit (deferred here from Phase 4) | After 5 failed logins for a username, each new try must wait 1, 2, 4 … up to 30 seconds (429, with an Arabic message). A success clears the count, and it's forgotten after 15 quiet minutes. |
| Open redirect after login: `/login?from=/%09/evil.example` sent the user to another site (the browser strips the tab) | The return path is parsed as a URL and must stay on this site. |
| A login form sent before its JavaScript loaded put the password in the URL | The form uses `method="post"`. |
| Another website could log a student out mid-quiz with a cross-site form | Logging out requires a JSON request, like every other change. |
| `/api/Auth/login` (the API ignores letter case) went through the general proxy and returned the raw token to the browser | The proxy refuses `auth/…` paths; logging in and out have their own routes. |
| A NUL character (`\u0000`) in any text, including the login username with no account needed, gave a 500 | Every text field that is stored or looked up refuses it with a 400. |
| Dates the validator accepted but JavaScript can't read gave a 500: week dates (`2026-W40-4`), ordinal dates, `T09Z`, comma fractions. Dates in UTC year 10000 were saved but couldn't be read back. | Only calendar date-times are accepted, and every date must be a real date before the year 10000 (400). |
| The web proxy read request bodies of any size into memory | Bodies over 100 KB (the API's own limit) get 413. The body is read as a stream, so chunked uploads are cut off too. |
| The example `JWT_SECRET` from `.env.example` would be accepted in production, and anyone could sign tokens with it | With `NODE_ENV=production`, the API refuses to start with it, or with any secret under 32 characters. |

About the login throttle:
- **Keyed on the username.** Every request reaches the API from the web server, and the
  centre probably shares one IP, so keying on the IP would slow down everyone at once.
- **Unknown usernames count too,** so the limit doesn't reveal which accounts exist.
- **Trade-off:** someone who types a classmate's username wrongly can make them wait up to
  30 seconds. There's no lockout beyond that.
- **Kept in memory:** one API process, and no Redis, per the brief. A restart forgets it.

### Checked and held (the brief's list)

| Attack | Result |
|---|---|
| Requests without a token | 401 on every protected route |
| Expired, forged or deleted-account tokens | 401 |
| Wrong role | 403 on every route |
| Another student's results | The attempt is found from the login, so there's nothing to reach (404). Views never include another student's score. |
| Another teacher's quiz | 404 on every read and change route, and nothing changes |
| Submitting after expiry | 409, backed by the database CHECK |
| Taking the same quiz twice | 409, and the unique index |
| Manipulating the score | The server computes it; sent values are ignored or rejected |
| Question or option IDs from elsewhere | 404 / 400 |
| Malformed JSON, wrong shapes or types, missing fields | 400 |
| Calling the API directly from another website | No CORS headers are sent, so browsers refuse |
| `__proto__` / `constructor` keys | Dropped before validation; they never reach the code or the database |

### Accepted, not fixed

- **Deeply nested JSON gives a 500.** A body nested about 20,000 levels deep makes the
  framework's validation recurse too far. Nothing is read or changed; it only adds log noise.
- **Teacher edit routes lock a quiz row before checking its owner.** Another teacher could
  briefly delay students starting it, but only if they knew its ID, which is never shown to
  them.
- **Answers are tied to their question and quiz in code, not by a composite foreign key.**
  The link is checked under the attempt's row lock, and questions are frozen once anyone
  starts.
- **No security headers such as `X-Frame-Options`.** Framing isn't exploitable, because
  the `SameSite=Lax` cookie isn't sent to a cross-site frame. Better set at deployment.
- **Logging out doesn't revoke the token.** Tokens are stateless and last 12 hours; logging
  out removes the cookie.
- **Any teacher can see a class's student list** by assigning a quiz to it. That follows from
  the brief: there's no teacher–class ownership.

## Phase 13 — Automated tests

### How the gaps were found

- **Coverage.** The API's e2e tests already reached about 98% of its lines. Line coverage
  can't tell whether a test would fail when a rule breaks, though.
- **Audit.** Two read-only audits mapped every rule in the brief's priority list to the tests
  that would fail if it broke, and listed the rules nothing protected.

### Decisions

- **One command runs everything:** `npm test` from the repository root runs the API unit
  tests, the API e2e tests and the web tests.
- **The web app got unit tests without new dependencies.** They use Node's built-in test
  runner, which strips TypeScript types itself.
  - They cover the pure helpers the Phase 12 security fixes depend on:
    - the return-path guard (open redirect)
    - the request guards (JSON only for changes, refusing `.`/`..` and `auth/…` in the
      proxy)
    - the body-size limit
    - Arabic plurals
  - To make them testable, those rules moved from the route handlers into `lib/`; the routes
    behave exactly as before.
  - This corrects an earlier statement (web frontend section) that every rule is "enforced
    (and tested) in the API". The Phase 12 fixes live in the web app, and these tests now
    cover them.
- **Race tests don't depend on timing.** Each one holds a real database lock and waits until
  the request under test is provably queued behind it, so the order is certain. These cover:
  - two starts at once, down to the duplicate insert
  - a teacher's edit racing a start
  - an answer, clear or submit whose deadline passes while it waits
  - the expiry step racing a submit

### Gaps closed

- **Timer:**
  - Resuming never recalculates the deadline after the closing date moves.
  - The deadline check made after the row lock decides, even when the expiry step before it
    didn't act.
  - The expiry step never overwrites a submission that got the lock first.
- **Scoring:** the answer that wins a race against submit is actually scored.
- **Locking after the first attempt:**
  - It also holds once every attempt has finished.
  - It holds against a start that is still in progress.
- **Authentication:**
  - A token is HS256, lasts 12 hours and carries only the user id. An HS512 token is refused.
  - The production secret check has its own unit tests.
  - Unknown usernames are throttled like real ones.
  - A successful login really clears the count.
- **Authorization:** another teacher gets 404, never a 409 that would reveal a quiz exists or
  what state it's in.
- **Smaller ones:**
  - the 100-question cap
  - publishing lists every problem, including safeguards the API can't normally trigger
  - exact finish times in teacher results
  - the unique attempt index
  - one test that could never fail was replaced

### Not covered by automated tests

- **The pages themselves and the web login route's cookie handling.** They need the Next.js
  runtime. They were checked in a headless browser and with `curl` (Phases 7, 11 and 12).
- **The API module calling the secret check at startup.** The check itself is unit-tested;
  the one line in `auth.module.ts` that calls it is not.

## Phase 14 — Seed & demo

`npm run db:seed` now builds a demo of the whole centre. The README ("Trying it out") lists
the accounts and quizzes.

### Decisions

- **The brief's real size:** 3 classes, 12 teachers and 300 students (100 per class). This
  replaces the smaller Phase 3 seed (3 teachers, 18 students).
  - The teacher results page gets tested with 200 students on one quiz.
  - Seven teachers have no quizzes, which shows what a new teacher sees.
- **Usernames went from two digits to three** (`s10a01` became `s10a001`), because a class now
  has 100 students.
- **The names are all made up.** Each is a random pair from a list of common first names and a
  list of common family names, and no pair is used twice. Four students in 11A have names
  in Latin letters, so the lists mix Arabic and Latin script, as they would in real use.
- **There's a quiz in every state a student or teacher can see:**
  - open
  - not open yet
  - draft
  - closed, with results
- **A 2-minute quiz, open to every class.** The brief's final QA (Phase 16) includes testing
  the timer, and the other quizzes have 15–25 minute limits. It also uses a different negative
  marking rate (50%) from the maths quizzes (25%).
- **The open quizzes start with no attempts.** A reviewer takes them fresh, sees their own
  result appear on the teacher's results page, and can watch the quiz lock after the first
  start. The closed quizzes carry the realistic history instead.
- **Past attempts are scored by the app's own code.** The seed creates each attempt with its
  answers, then ends it with `finalizeAttempt`, the same function the API uses on submit or
  expiry.
  - No score is written by hand.
  - The database's CHECK constraints (deadline, submission time, score range) apply to every
    seeded row, as they do to real ones.
- **The history is the same on every run.** It comes from a small seeded random generator,
  not `Math.random`.
- **Dates are relative to the day the seed runs**, with quizzes opening and closing in the
  afternoon or evening. Each quiz stays in its described state for a few days: the upcoming
  one opens after 3 days, and the open ones close after 14 or more. Re-running the seed
  resets them.
- **The first three students of each class have fixed outcomes** on their class's closed
  quiz, so the README can point at them:
  - `…001` submitted
  - `…002` ran out of time
  - `…003` never started

### How it was checked

The seed was run twice in a row against a separate scratch database, not the development
one: it deletes all data. Then:

- **SQL checks:**
  - Every stored score and per-answer point matched an independent recomputation (correct
    +points, wrong −percent, total floored at 0).
  - Every attempt falls inside its quiz's window.
  - All 300 names are different.
  - The open quizzes have no attempts.
- **A temporary API against the same database** showed:
  - each student state
  - the teacher statistics on the fractions quiz: 200 students listed, and an average of
    7.51 out of 14 over the 185 finished attempts
  - a 120-second deadline on the 2-minute quiz
  - 409 when starting a quiz that is upcoming or closed
  - 404 for another teacher's results

### Deliberately left out

- **In-progress attempts in the seed.** Their deadlines would pass minutes after seeding, so
  what a reviewer saw would depend on when they looked. Taking a quiz shows that state
  anyway.
- **No automated test for the seed.** The seed is a development tool. The rules it relies on
  (scoring, deadlines, the CHECK constraints) are already tested, and it was checked as
  described above.

## Phase 15 — Documentation

### Decisions

- **One-command setup**, chosen by the human over documented steps alone.
  - `npm run setup` ([`scripts/setup.mjs`](./scripts/setup.mjs)) does four things:
    - creates each missing `.env` from its example
    - starts Postgres and waits until it's healthy (`docker compose up -d --wait`)
    - applies the migrations
    - loads the demo
  - `npm run dev` ([`scripts/dev.mjs`](./scripts/dev.mjs)) starts Postgres if needed, then
    the API and the web app together.
  - Both are plain Node scripts with no new dependencies and no shell-specific commands, so
    they should behave the same on Windows, macOS and Linux. They were tested on Windows
    only.
  - `docker-compose.yml` changed only in its health check (below).
- **Setup never overwrites an existing `.env`,** so someone who changed a port keeps their
  change.
- **Setup applies migrations with `migrate deploy`, not `migrate dev`.** Deploy never creates
  a new migration or asks a question, so it's safe to run on any clone.
- **`npm run dev` runs npm's entry point with the current Node**, instead of spawning `npm`
  through a shell, which avoids one extra shell on Windows.
  - npm still runs each app's own script through the system shell.
  - Ctrl+C in a terminal is delivered to every process started from it, so it should stop
    both apps. The review agreed, but it wasn't tried by hand: the tests stopped the apps by
    their process ids.
- **`npm run dev` fixes the web app's port to 3000.** Found in review: if 3000 was taken,
  Next.js moved to the next free port, 3001, before the API (which takes a few seconds to
  build) could start there. The API then failed and the web app talked to itself. Now the
  web app stops with "address already in use", and the script says which app stopped.
  - Only `npm run dev` fixes the port. Doing the same in the web app's own scripts belongs to
    the separate login-failure fix, which the human asked to keep on its own branch.
- **Postgres's health check now connects over TCP** (`pg_isready -h 127.0.0.1`). On its very
  first start, Postgres briefly runs a socket-only server while it initialises. The old
  check could report that as healthy, and setup's migrations would then fail to connect.
- **Setup always loads the demo**, which deletes the development data, and it says so on
  screen as it does. Running it again is the documented way to reset the demo. It's for a
  machine's first setup.
- **This file and `AI_USAGE.md` got a summary on top**, under the brief's headings, chosen by
  the human over rewriting them by topic. The phase logs stay below as the detailed record.
  - The web frontend section moved to its place in time, between Phases 5 and 6.
  - A few log lines that later phases overtook got a short note instead of being rewritten.
- **The two app READMEs** were still the generators' boilerplate, with commands that don't
  apply here. They now point to the root README and describe their own folders.

### How it was checked

A fresh clone of this branch, in a scratch folder, was taken through the README. This
machine already has a PostgreSQL on port 5432, so the README's steps for a taken port were
followed first, using 5434.

- **`npm install`, then `npm run setup` twice.**
  - The first run created the missing `.env`, started Postgres, applied the three
    migrations and loaded the demo.
  - The second run left every `.env` alone, had no pending migrations, and reset the demo.
- **`npm run dev` served both apps.** Checks through the web app, the way a browser uses
  it:
  - logging in as a student and as a teacher
  - the role redirects
  - the pages
  - the `/api/*` proxy
  - the README's `curl` example against the API
- **The font download failed once.** On the first start, the Arabic font download timed out
  and every page returned 500. After a restart with `.next` deleted, it worked. That's now
  in the README's prerequisites and under known limitations.
- **`npm test` in the fresh clone:** 55 API unit, 201 API e2e and 15 web tests, all passing.
- **After the review's fixes:**
  - Setup was run again on an emptied Postgres volume, so the new health check was tested on
    a database's first start.
  - `npm run dev` was run with port 3000 already taken: the web app stopped with "address
    already in use", the API kept 3001, and the script said which app stopped.
  - `npm run dev` then worked normally.

## Phase 16 — Final QA & submission

### How each step of the brief's checklist was checked

A fresh clone of `master` from GitHub, in a scratch folder, was taken through the README
exactly as written. This machine's port 5432 is taken, so the README's busy-port steps came
first. The flows ran in headless Edge through the real web pages, on phone-sized screens,
and every result was checked against the API and the database.

| Brief step | How | Result |
|---|---|---|
| 1–2. Clone, follow the README | `git clone` from GitHub, `npm install` | Pass |
| 3–5. Database, migrations, seed | `npm run setup`: Postgres healthy, 3 migrations applied, demo loaded (251 submitted, 26 expired) | Pass |
| 6. Start frontend and backend | `npm run dev`: API on 3001, web app on 3000 | Pass |
| 7. Teacher flow | See the teacher flow below | Pass |
| 8. Student flow | See the student flow below | Pass |
| 9. Timer | The 2-minute quiz runs out in the browser. See the timer below. | Pass |
| 10. Duplicate attempts | A finished quiz offers no second start; starting again gets 409; 6 simultaneous starts make 1 attempt | Pass |
| 11–12. Scoring and negative marking | See the scoring cases below | Pass |
| 13. Arabic, right to left | `lang="ar" dir="rtl"`, the Arabic font applied, Arabic errors and dates, English quiz content left to right; screenshots reviewed | Pass |
| 14. Mobile layout | 43 screenshots at 375px and 320px: no horizontal overflow, no console errors; screenshots reviewed | Pass |
| 15. Automated tests | `npm test` in the clone: 55 API unit, 201 API e2e, 15 web; also both production builds, lint and type-check | Pass |
| 16. git status | Clean | Pass |
| 17. Commit history | 54 commits and 16 PR merges, nothing rewritten, no WIP messages; every non-merge commit names its AI model | Pass |
| 18. No secrets | A read-only audit of the whole history: no keys, tokens or real secrets, and only `.env.example` files ever committed | Pass; `.gitignore` hardened (below) |
| 19. No build artifacts or `node_modules` | None tracked, now or ever. Building in the clone left `git status` clean. | Pass |
| 20. Ready to freeze | See "Left as they are" below | Ready once this phase is merged |

**The teacher flow,** as `teacher.sami`, who had no quizzes:
1. Create a quiz through the form: 50% negative marking, 10 minutes, class 10A.
2. Add two questions, one with three options.
3. Publish it.
4. A 10A student takes it.
5. The editor then shows the lock, and editing a question gets 409.
6. The results page lists all 100 students of 10A, with one submission.

**The student flow,** as `s10a004`:
1. The quiz list, then the quiz's details, then the start confirmation.
2. Tap four answers, and check the server saved all four.
3. Refresh the page: the answers and the deadline stay the same.
4. The submit confirmation, then the result page.

**The timer.** Start the 2-minute quiz and tap one answer:
- The countdown turns red in the last minute.
- At zero the page moves to the result by itself.
- A late answer and a late submit both get 409.
- The teacher sees EXPIRED, scored from the saved answer (2).

**The scoring cases,** each checked on the result page, through the API, and in the stored
per-answer points:

| Quiz | Answers | Expected score |
|---|---|---|
| Maths, 25% | +1 −0.25 +2 −0.5, one blank | 2.25 of 9 |
| The quick quiz, 50% | all wrong | −3, floored to 0 of 6 |
| The quick quiz, 50% | one right, one wrong | +2 −0.5 = 1.5 |
| The teacher's new quiz, 50% | one right, one wrong | +2 −2 = 0 |

Authorization, checked in the pages: another teacher opening the quiz's address sees "not
found", and a student opening `/teacher` lands on `/student`.

### Decisions

- **Two read-only reviews ran:**
  - an audit of the whole git history for secrets and artifacts
  - a check of every requirement in the brief against the code, the tests and the docs

  Neither found anything that must be fixed.
- **`.gitignore` hardened,** from the history audit:
  - Every `.env` variant, such as `.env.production` or `.env.test`, is now ignored, not just
    `.env` and `.env.local`. The `.env.example` files stay committed.
  - Claude Code's personal settings file (`.claude/settings.local.json`) is now ignored by
    the repository itself. Before, only the author's own global git settings ignored it.
- **Left as they are:**
  - `GET /` still returns Nest's default "Hello World!". It serves as the health check, and
    the README documents it that way.
  - The web app still has Next.js's default favicon.
  - Three Python cache files from a skill are still in the history. They were committed in
    the web frontend pass and removed straight after. Taking them out of the history would
    mean rewriting it, which the brief forbids.
  - The API's one lint warning, on the unawaited `bootstrap()` call in `main.ts`, is from
    Nest's generated starter.

## After Phase 16 — Browser extensions and hydration warnings

- **The problem:** a Next.js "hydration mismatch" error in the human's browser, on every
  page. Two browser extensions add their own attributes to the page before React takes over:
  - `bbai-tooltip-injected` on `<html>`
  - `wotdisconnected` on `<body>`

  React then sees attributes it didn't render. The app itself doesn't cause it: the Phase 16
  QA, in a browser without extensions, logged no errors.
- **The fix:** `suppressHydrationWarning` on `<html>` and `<body>` in `app/layout.tsx`, the
  usual fix for this. It only ignores attribute differences on those two elements. A
  mismatch inside the app's own markup is still reported.
- **How it was checked:** a headless browser added the same two attributes before React
  hydrated, the way the extensions do.
  - Before the fix it logged the same error.
  - After the fix: no error, with or without the attributes.
  - An attribute added inside the page, on `<main>`, is still reported.
