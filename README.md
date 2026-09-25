# Quizora

A quiz platform for Nour's tutoring centre in Amman (about 300 students, 12 teachers and 3
classes).
Teachers write timed multiple-choice quizzes. Students take each quiz once, on their phones,
between its opening and closing dates, and see their score when they finish. The interface is
in Arabic, right to left, and built for phones first.

- [Features](#features)
- [Quick start](#quick-start)
- [Prerequisites](#prerequisites)
- [Setup in detail](#setup-in-detail)
- [Database, migrations and seed](#database-migrations-and-seed)
- [Development commands](#development-commands)
- [Trying it out: sample accounts](#trying-it-out-sample-accounts)
- [Tests](#tests)
- [Architecture](#architecture)
- [API](#api)
- [Web app](#web-app)
- [Repository structure](#repository-structure)
- [Documentation](#documentation)

## Features

**Teachers**
- Create a quiz with:
  - a title and description
  - opening and closing dates
  - a time limit
  - a negative-marking percentage, set per quiz
  - the classes it's for
- Add questions with 2–6 options, exactly one correct answer, and points per question.
- Publish. The server checks that the quiz is complete. Drafts are invisible to students.
- Once a student starts a quiz, its questions and scoring rules are locked.
- See each quiz's results:
  - every student's status and score
  - the average, highest and lowest score
  - how many got each question right, got it wrong, or left it blank

**Students**
- See their quizzes grouped into available now, upcoming and past.
- Start a quiz. There's one attempt, and the timer runs on the server.
- Answers are saved as they're tapped, so a refresh or a lost connection resumes the same
  attempt.
- Submit, or the attempt ends when time runs out.
- See their own score, and never anyone else's.

**Rules the server enforces**
- Who can see and take which quiz.
- The dates, the time limit and one attempt per student.
- The score. A correct answer earns the question's points. A wrong one loses the quiz's
  percentage of those points. A blank costs nothing, and a total never goes below 0.

The browser is never trusted with any of these.

## Quick start

With [Node.js 22.12+](#prerequisites) and Docker running:

```bash
git clone https://github.com/mohammedsalem1/Quizora.git
cd Quizora
npm install        # both apps (npm workspaces); also generates the Prisma client
npm run setup      # .env files, Postgres in Docker, migrations, demo data
npm run dev        # API on :3001 and web app on :3000, together
```

Open **http://localhost:3000** and log in as `teacher.rana` or `s10a001`. The password is
`Quizora@2026`; [more accounts below](#trying-it-out-sample-accounts). Ctrl+C stops both apps.

## Prerequisites

- **Node.js 22.12 or newer on the 22 line, or 24+**, with npm. Prisma 7 supports Node
  ^20.19, ^22.12 and 24+, and the web tests need Node 22's built-in TypeScript support. It
  was developed on Node 22.13.
- **Docker** with Compose v2.1 or newer, for `--wait`: Docker Desktop, or Docker Engine
  with the compose plugin. Only Postgres runs in Docker; the two apps run on your machine.
- **Free ports:** 3000 (web app), 3001 (API) and 5432 (Postgres).
  - If 3000 or 3001 is taken, `npm run dev` stops the app that needs it, with an
    "address already in use" error. Free the port and run it again.
  - If 5432 is taken, for example by a local PostgreSQL, do this before `npm run setup`:
    1. Copy `.env.example` to `.env` and `apps/api/.env.example` to `apps/api/.env`.
    2. In `.env`, set `POSTGRES_PORT` to a free port, such as 5433.
    3. In `apps/api/.env`, use the same port in `DATABASE_URL` and `TEST_DATABASE_URL`.

    Setup keeps existing `.env` files.
- **Internet access** for `npm install` and the web app's first start. The first start
  downloads the Arabic font once, then serves it itself. If that download times out, every
  page shows a 500 error mentioning `font/google`. To fix it:
  1. Stop `npm run dev`.
  2. Delete `apps/web/.next`.
  3. Start it again.

## Setup in detail

`npm run setup` ([`scripts/setup.mjs`](./scripts/setup.mjs)) runs these steps in order. Each
can also be run by hand:

| Step | By hand |
|---|---|
| 1. Create each missing `.env` from its `.env.example`, in the repo root, `apps/api` and `apps/web`. An existing `.env` is never changed. | copy the three files |
| 2. Start Postgres and wait until it's healthy | `docker compose up -d --wait` |
| 3. Apply the database migrations | `npm run db:deploy` |
| 4. Load the demo data. **This deletes all data in the development database first.** | `npm run db:seed` |

Running `npm run setup` again resets the demo. The setup and dev scripts use only Node and
Docker commands, so they should work the same on macOS and Linux, but they were tested on
Windows only.

**Environment variables.** The defaults work together out of the box. Each app reads the
`.env` in its own folder.

| File | Variable | Default | What it's for |
|---|---|---|---|
| `.env` | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | `quizora`, `quizora`, `quizora`, `5432` | The Postgres container (`docker-compose.yml`) |
| `apps/api/.env` | `DATABASE_URL` | `postgresql://quizora:quizora@localhost:5432/quizora` | The development database |
| | `TEST_DATABASE_URL` | `…/quizora_test` | The database the e2e tests wipe and refill. Its name must end in `_test`. |
| | `JWT_SECRET` | `change-me-in-production` | Signs login tokens. With `NODE_ENV=production` the API refuses to start with this value or anything under 32 characters: generate one with `openssl rand -base64 48`. |
| | `API_PORT` | `3001` | The API's port |
| `apps/web/.env` | `API_URL` | `http://localhost:3001` | Where the web server reaches the API. Server-only: the browser never calls the API. |

`.env` files are gitignored; only the `.env.example` files are committed.

## Database, migrations and seed

- **Postgres 16** runs in Docker. Its data lives in the `quizora-db-data` volume, so it
  survives restarts.
- **The schema** is [`apps/api/prisma/schema.prisma`](./apps/api/prisma/schema.prisma), the
  single source of truth. Some rules Prisma can't express, so they're hand-written SQL in the
  migrations. The top of the schema file lists them:
  - CHECK constraints on dates, points, percentages, deadlines and score ranges
  - one correct option per question
  - students always have a class, teachers never do
- **Migrations** are in [`apps/api/prisma/migrations`](./apps/api/prisma/migrations):
  - `npm run db:deploy` applies them. Setup uses it, and so would production.
  - `npm run db:migrate` is for development. It applies pending migrations and, after you
    change `schema.prisma`, creates a new one (it asks for a name).
- **The seed,** `npm run db:seed` ([`apps/api/prisma/seed.ts`](./apps/api/prisma/seed.ts)),
  deletes everything and loads the demo below. It refuses to run with `NODE_ENV=production`.
- **Other commands:**
  - Stop Postgres: `docker compose stop`.
  - Start over with an empty database: `docker compose down -v` (it deletes the volume),
    then `npm run setup`.

## Development commands

All run from the repository root.

| Command | What it does |
|---|---|
| `npm run setup` | One-time setup (above); run again to reset the demo |
| `npm run dev` | Starts Postgres if needed, then the API and the web app (on a fixed port, 3000) together, both reloading on changes |
| `npm run dev:api` / `npm run dev:web` | One app only (http://localhost:3001 / http://localhost:3000) |
| `npm run db:deploy` / `db:migrate` / `db:seed` | [Database commands](#database-migrations-and-seed) |
| `npm test` | [Every test suite](#tests) |
| `npm run build:api` / `npm run build:web` | Production builds |
| `npm run lint --workspace apps/api` | Lint the API; it fixes what it can automatically |
| `npm run lint --workspace apps/web` | Lint the web app |

**Running a production build locally:**
- API: `npm run build:api`, then `npm run start:prod --workspace apps/api`.
- Web app: `npm run build:web`, then `npm run start --workspace apps/web`.

In production, set `NODE_ENV=production` and a real `JWT_SECRET`, and serve the web app over
HTTPS: its login cookie is marked `Secure` in production.

## Trying it out: sample accounts

`npm run db:seed` (or `npm run setup`) fills the database with a demo of the whole centre:
3 classes, 12 teachers and 300 students, all with made-up names, plus a quiz in every state.
Log in at http://localhost:3000. Every account's password is `Quizora@2026`.

| Account | Role | What you'll see |
|---|---|---|
| `teacher.rana` | Teacher (maths) | An open quiz nobody has started, and a closed one with results for 200 students |
| `teacher.khaled` | Teacher (physics) | A closed quiz with results for 11A |
| `teacher.omar` | Teacher (biology) | An open quiz in English for 11A |
| `teacher.huda` | Teacher (Arabic) | A draft, and a published quiz that opens in 3 days |
| `teacher.lina` | Teacher (English) | The 2-minute quiz |
| `teacher.sami`, `teacher.maha`, `teacher.yazan`, `teacher.rasha`, `teacher.bilal`, `teacher.nadia`, `teacher.tariq` | Teacher | No quizzes yet |
| `s10a001` … `s10a100` | Student, 10A | |
| `s10b001` … `s10b100` | Student, 10B | |
| `s11a001` … `s11a100` | Student, 11A | Four of them have names in Latin letters |

The quizzes, as they are for a few days after you run the seed (dates are relative to that
day, so re-run it before a demo):

| Quiz | Teacher | Classes | State | Time limit | A wrong answer costs |
|---|---|---|---|---|---|
| اختبار الرياضيات: المعادلات الخطية | rana | 10A, 10B | Open | 20 min | 25% of its points |
| Biology: The Cell | omar | 11A | Open | 15 min | nothing |
| مراجعة سريعة: مفردات إنجليزية | lina | all three | Open | **2 min** | 50% of its points |
| اختبار اللغة العربية: الإملاء | huda | all three | Opens in 3 days | 15 min | nothing |
| اختبار اللغة العربية: النحو | huda | 10A | Draft | 20 min | nothing |
| اختبار الرياضيات: الكسور والنسب المئوية | rana | 10A, 10B | Closed, with results | 25 min | 25% of its points |
| اختبار الفيزياء: الحركة في خط مستقيم | khaled | 11A | Closed, with results | 20 min | nothing |

Nobody has started the open quizzes, so any student can take them fresh. On the closed
quizzes, most students submitted, some ran out of time and a few never started. The first
three students in each class have fixed outcomes on their class's closed quiz:

- `…001` submitted
- `…002` ran out of time
- `…003` never started

Everyone else's outcome is random, but the same on every run.

**Things to try**
- **As a teacher:**
  1. Create a quiz, add questions and tap the letter of the correct answer, then publish.
  2. Open "عرض النتائج" on a quiz to see its results.
  3. Log in as another teacher and try to open your quiz's address: it doesn't exist for
     them.
- **As a student:**
  1. Start a quiz and tap answers. Refresh the page mid-quiz: the answers and the timer
     carry on.
  2. Submit, or take the 2-minute quiz and let the time run out.
  3. Try to start the same quiz again: there's no second attempt.
- **Both at once:** once a student starts a quiz, its teacher can no longer change its
  questions, time limit or negative marking.

## Tests

Run everything from the repository root with `npm test` (Postgres must be running:
`docker compose up -d`). Or run one suite:

| Command | What it runs | Needs |
|---|---|---|
| `npm run test:api` | API unit tests (Jest): pure rules such as scoring, availability, deadlines, statistics, the login throttle and the production secret check | nothing |
| `npm run test:api:e2e` | API end-to-end tests (Jest + Supertest): the real app and a real database, called over HTTP | Postgres |
| `npm run test:web` | Web unit tests (Node's built-in test runner, no extra dependencies): return-path guard, request guards, body-size limit, Arabic plurals | nothing |

**The e2e tests use a separate database.** It's set by `TEST_DATABASE_URL` in `apps/api/.env`,
and is created, emptied and migrated automatically. Every test file **deletes all data in
it**, so the tests refuse to run unless the database name ends in `_test`. The files run
one at a time (`--runInBand`) because they share that database. Don't run two e2e runs at
once.

**Where each rule is tested:**

| Rule | Tests |
|---|---|
| Logging in, tokens (HS256, 12 hours, only the user id), expired, forged or deleted-account tokens, password guessing | `test/auth.e2e-spec.ts`, `test/security.e2e-spec.ts`, `src/auth/*.spec.ts` |
| Roles and ownership on every route; a teacher sees only their own quizzes and results; a student only their own attempt | `test/security.e2e-spec.ts`, `test/teacher-quizzes.e2e-spec.ts`, `test/teacher-results.e2e-spec.ts` |
| Quiz availability: class, draft, opening and closing window | `src/quizzes/availability.spec.ts`, `test/student-quizzes.e2e-spec.ts` |
| One attempt per student, including simultaneous starts | `test/student-attempts.e2e-spec.ts` |
| Timer: server deadline, expiry, no answers or submission after it, including races | `src/attempts/attempt-rules.spec.ts`, `test/student-attempts.e2e-spec.ts` |
| Scoring and negative marking | `src/attempts/scoring.spec.ts`, `test/student-attempts.e2e-spec.ts` ("scoring") |
| Teacher statistics | `src/quizzes/quiz-results.spec.ts`, `test/teacher-results.e2e-spec.ts` |
| The quiz locking after the first attempt | `test/teacher-quizzes.e2e-spec.ts`, `test/student-attempts.e2e-spec.ts` |
| Malformed requests and database safety nets | `test/security.e2e-spec.ts`, `test/teacher-quizzes.e2e-spec.ts`, `test/student-attempts.e2e-spec.ts` |

API test paths are relative to `apps/api`. The web tests sit next to the code they test in
`apps/web/lib` (`*.test.mts`). The pages themselves have no automated tests; see
`DECISIONS.md`.

## Architecture

```
 Phone browser
      │  pages, and fetch("/api/…") with the httpOnly session cookie
      ▼
 Next.js web app  (apps/web, :3000)
      │  /api/* route handlers forward each request with the JWT as a Bearer token
      ▼
 NestJS API  (apps/api, :3001)   ← every rule and every authorization check
      │  Prisma
      ▼
 PostgreSQL 16  (Docker, :5432)  ← unique indexes and CHECK constraints as a safety net
```

- **The browser only talks to the web app.**
  - Logging in goes through `app/api/auth/login`. It calls the API and stores the token in an
    httpOnly, `SameSite=Lax` cookie, which page scripts can't read.
  - `app/api/[...path]` forwards every other API path to the API with the token attached.
    It refuses `/auth/…`, so the raw token never reaches the browser.
  - Requests with a body (POST, PUT, PATCH) must be JSON. A cross-site page can't send
    JSON, or a DELETE, without CORS approval, which the app never gives. Together with
    `SameSite=Lax`, that blocks cross-site request forgery.
  - `proxy.ts` only sends visitors with no session cookie to the login page.
- **The API decides everything.**
  - A global guard requires a valid token on every route unless it's marked public. Only
    login and the `GET /` health check are.
  - The user and their role are loaded from the database on every request. The token carries
    only the user id.
  - A second guard checks the role each route declares.
  - A global validation pipe rejects unknown or malformed fields.
- **Time and attempts:**
  - All time decisions use the API server's clock.
  - An attempt's deadline is fixed when it starts: the time limit, or the quiz's closing
    time if that comes first.
  - Answers and submits lock the attempt's row, so they happen one at a time. A late one is
    refused.
  - Attempts whose time ran out are ended and scored the next time the student or the
    teacher looks. There's no background job.
- **Scoring** happens in one place, `finalizeAttempt()`, when an attempt ends. It counts in
  whole hundredths of a point, so the arithmetic is exact.

The reasons behind these choices are in [`DECISIONS.md`](./DECISIONS.md).

**Where the code is**

| Folder | What's in it |
|---|---|
| `apps/api/src/auth` | Login, tokens, the auth and role guards, the login throttle |
| `apps/api/src/quizzes` | Teacher quiz management, student quiz list, availability rule, teacher results and statistics |
| `apps/api/src/attempts` | Starting, answering and submitting; deadlines, expiry, scoring |
| `apps/api/src/classes` | The class list for the quiz form |
| `apps/api/prisma` | Schema, migrations, seed |
| `apps/api/test` | End-to-end tests |
| `apps/web/app` | Pages, and the `/api/*` route handlers |
| `apps/web/components` | Shared UI: the header, the login and quiz forms, question cards, a quiz question with its answer bubbles, the countdown |
| `apps/web/lib` | Answer saving, date and Arabic formatting, request guards, API error translation |

## API

JSON over HTTP on port 3001. Every route except the first two needs
`Authorization: Bearer <token>` from `POST /auth/login`. A route for one role returns 403 to
the other role.

| Method and path | Who | What it does |
|---|---|---|
| `GET /` | anyone | Health check |
| `POST /auth/login` | anyone | `{ username, password }` → `{ accessToken, user }`. The token lasts 12 hours. |
| `GET /auth/me` | any user | The logged-in user and their class |
| `GET /classes` | teacher | Classes a quiz can be assigned to |
| `GET /teacher/quizzes` | teacher | Your quizzes, with question and attempt counts |
| `POST /teacher/quizzes` | teacher | Create a draft. Dates need a timezone, e.g. `2026-10-01T09:00:00+03:00`. |
| `GET /teacher/quizzes/:quizId` | teacher | One of your quizzes, including the correct answers |
| `PATCH /teacher/quizzes/:quizId` | teacher | Change its settings |
| `POST /teacher/quizzes/:quizId/questions` | teacher | Add a question with its options |
| `PUT /teacher/quizzes/:quizId/questions/:questionId` | teacher | Replace a question |
| `DELETE /teacher/quizzes/:quizId/questions/:questionId` | teacher | Remove a question |
| `POST /teacher/quizzes/:quizId/publish` | teacher | Check it's complete and publish it |
| `GET /teacher/quizzes/:quizId/results` | teacher | Every student's status and score, and the statistics |
| `GET /student/quizzes` | student | Your quizzes, each with its state and, once finished, your score |
| `GET /student/quizzes/:quizId` | student | One of them |
| `POST /student/quizzes/:quizId/attempt` | student | Start your attempt, or resume it if it's still running |
| `GET /student/quizzes/:quizId/attempt` | student | Your attempt: its deadline, the server's time, and the questions and your answers while it runs |
| `PUT /student/quizzes/:quizId/attempt/answers/:questionId` | student | Save or change an answer: `{ "optionId": "…" }` |
| `DELETE /student/quizzes/:quizId/attempt/answers/:questionId` | student | Clear an answer |
| `POST /student/quizzes/:quizId/attempt/submit` | student | Submit. Repeating it returns the same result. |

**Status codes:**

| Code | Meaning |
|---|---|
| 400 | Invalid input, including any unknown field |
| 401 | No token, an expired or invalid one, or a wrong username or password at login |
| 403 | Wrong role |
| 404 | Not found, or not yours. Another teacher's quiz, or a quiz a student can't see, looks exactly like one that doesn't exist. |
| 409 | Not allowed now. For example: the quiz isn't open, the time is up, the attempt was already used, the quiz is locked, or it isn't complete enough to publish (the message lists what's missing). |
| 413 | The request body is over 100 KB |
| 429 | Too many failed logins for that username; wait and retry |

The web app's `/api/*` routes also return 415 for a POST, PUT or PATCH that isn't JSON.
Error messages are in English; the web app translates them into Arabic.

For example, with the demo data and the API running:

```bash
TOKEN=$(curl -s localhost:3001/auth/login -H 'content-type: application/json' \
  -d '{"username":"s10a001","password":"Quizora@2026"}' | node -p 'JSON.parse(require("fs").readFileSync(0)).accessToken')
curl -s localhost:3001/student/quizzes -H "authorization: Bearer $TOKEN"
```

## Web app

| Page | Who | What it shows |
|---|---|---|
| `/login` | everyone | The login form |
| `/` | logged in | Sends teachers to `/teacher` and students to `/student` |
| `/teacher` | teacher | My quizzes |
| `/teacher/quizzes/new` | teacher | Create a quiz |
| `/teacher/quizzes/[quizId]` | teacher | Edit settings and questions, and publish |
| `/teacher/quizzes/[quizId]/results` | teacher | Results and statistics |
| `/student` | student | My quizzes: available now, upcoming, past |
| `/student/quizzes/[quizId]` | student | Quiz details, and the start button |
| `/student/quizzes/[quizId]/attempt` | student | Taking the quiz, with the countdown |
| `/student/quizzes/[quizId]/result` | student | My result |

Opening the other role's pages sends you to your own. The route handlers
`/api/auth/login`, `/api/auth/logout` and `/api/*` are the only way the browser reaches the
API.

## Repository structure

```
apps/
  api/                 NestJS API, Prisma schema, migrations and seed (own .env.example)
  web/                 Next.js web app (own .env.example)
scripts/
  setup.mjs            npm run setup
  dev.mjs              npm run dev
docker-compose.yml     Postgres for local development
.env.example           Postgres settings for docker-compose
package.json           npm workspaces root and the commands above
CLAUDE.md              Standing instructions for AI-assisted work on this repo
DECISIONS.md           Assumptions, design decisions, what was left out, limitations, next steps
AI_USAGE.md            How AI was used, and how its work was checked
.claude/skills/, .agents/skills/, skills-lock.json
                       Skills for the AI coding assistant, listed in skills-lock.json
                       (not part of the app)
```

## Documentation

- [`DECISIONS.md`](./DECISIONS.md):
  - assumptions and important design decisions
  - what was left out, and what was built beyond the brief
  - known limitations, and what to improve next
- [`AI_USAGE.md`](./AI_USAGE.md): which AI tools were used, how they were directed, and how
  their output was reviewed and tested.
- [`CLAUDE.md`](./CLAUDE.md): the standing brief for AI-assisted work in this repo.
