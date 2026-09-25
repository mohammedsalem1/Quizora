# AI Usage

Honest account of how AI tools were used on this project. Updated as work progresses.

## Tools

- **Claude Code**, used interactively from the terminal in this repository. The underlying
  model was switched during the work (Sonnet 5 for most of Phase 1, Opus 5.5 to finish it);
  the model used for each commit is recorded in its `Co-Authored-By` trailer.

## How it was directed

- Work is driven turn-by-turn by a human giving explicit instructions and reviewing output
  before it's committed — not by an unsupervised agent loop.
- A standing project brief lives in [`CLAUDE.md`](./CLAUDE.md), describing architecture,
  coding principles, testing/security expectations, and Git workflow, so the AI's output
  stays consistent with those constraints across sessions.
- Work is broken into phases (this file's Phase 1 entry corresponds to
  [`DECISIONS.md`](./DECISIONS.md)'s Phase 1 section). Each phase is scoped explicitly before
  the AI writes any code, and the AI is told what *not* to build yet.

## How output was checked

- Every file the AI created or changed was reviewed before committing.
- Scaffolding commands (`create-next-app`, `@nestjs/cli new`) were run through the AI but are
  themselves standard, well-known generators — their output is the same as a human would get
  running them directly.
- This section will be expanded with specifics (what was generated vs. hand-written, what
  the AI got wrong and had to be corrected, which tests were AI-authored vs. human-authored)
  as later phases add real application logic.

## Phase 1 — Project foundation

- The AI scaffolded `apps/web` (Next.js) and `apps/api` (NestJS) using their official
  generators, added Prisma to the backend with an empty schema, wrote `docker-compose.yml`
  for local Postgres, and wrote this documentation skeleton plus `CLAUDE.md`.
- No business logic exists yet, so there is nothing to check for correctness beyond "does it
  build" — verified by running `npm run build:api` and `npm run build:web` locally.
- Setup issues the AI hit along the way: flaky network timeouts during `npm install`, and
  npm's `latest` tag for Prisma pointing at a prerelease (pinned to 7.10.0, see
  `DECISIONS.md`). The AI first misdiagnosed two build errors as needing config workarounds
  (forcing webpack, restricting TypeScript `types`). After a clean reinstall it re-tested
  without them, found the real cause was a corrupted `node_modules`, and reverted both.

## Phase 2 — Data model design

- The AI (Claude Code, Opus 5.5) proposed the data model as a draft Prisma schema with its
  reasoning, before any code was written. The human reviewed it, chose each of the four
  scoring and timing rules (how negative marking is represented, whether a score can go below
  0, when a late-started attempt ends, whether to have a draft/publish step) from options the
  AI laid out, and approved the rest.

## Phase 3 — Database implementation

- The AI wrote the Prisma schema, the hand-written SQL constraints in the init migration,
  the seed script (with fictional Arabic names and Arabic/English quiz content) and the
  npm scripts, following the approved design.
- How it was checked, beyond "it runs":
  - Every database constraint was tested by running SQL that should violate it (12 cases,
    such as a second attempt, a second correct option, a teacher with a class or a 101%
    penalty) and confirming each was rejected by the intended constraint.
  - The migration and seed were run on a brand-new throwaway database, and the live database
    was diffed against the schema to confirm Prisma won't try to drop the hand-written
    constraints later.
  - Arabic text was read back from Postgres and its character count checked.
- Found while reviewing the AI's output: Prisma's generated SQL made the student→class link
  `ON DELETE SET NULL`, which would have clashed with the "students have a class" check; it
  was changed to `RESTRICT` before the migration was applied. The generated Prisma client
  also failed to load under `ts-node` at first; it was fixed with a generator option rather
  than a workaround in the seed.

## Phase 4 — Authentication & roles

- The AI wrote the auth module (login, JWT, the two global guards, decorators, input
  validation), the Prisma service, the e2e test setup and the auth tests. Before writing
  code, it stated its plan, assumptions and risks (token lifetime, no sign-up, login page
  deferred to Phase 7).
- How it was checked:
  - 25 API end-to-end tests against a real test database. They cover login, malformed input,
    a client-sent role, missing/garbage/forged/tampered/unsigned/expired tokens, a deleted
    account, and role checks in both directions.
  - To confirm the tests would actually catch regressions, two protections were removed on
    purpose, one at a time: without the role guard, 3 tests failed; with unknown fields
    allowed, 1 test failed. Both were then restored.
  - It was confirmed that the tests refuse to run against the development database, and that
    the development data was untouched afterwards.
  - The login endpoints were also checked by hand with `curl` against the seeded dev accounts.
- What went wrong along the way: the AI first installed `@nestjs/jwt`/`@nestjs/config` v12.
  The app built and ran, but the tests failed because those versions are ESM-only and meant
  for NestJS 12. The AI switched to the NestJS 11 versions instead of working around the
  problem in Jest.

## Phase 5 — Teacher quiz management

- The AI wrote the teacher quiz API (DTOs, service, controllers) and 67 new e2e tests. Before
  writing code it listed the endpoints and the choices it was making (options saved together
  with their question, 404 for other teachers' quizzes, dates must include a timezone, what
  was left out).
- How it was checked:
  - 92 e2e tests in total. The new ones cover role checks and ownership, 22 invalid quiz
    settings, 14 invalid questions, swapping in another quiz's question ID, publishing rules,
    and the lock after a student starts.
  - Four protections were removed on purpose, one at a time: the ownership filter, the
    post-attempt lock, the one-correct-answer rule, and the check that a question belongs to
    the quiz in the URL. Each time at least one test failed, and each was restored
    byte-for-byte.
  - The endpoints were also tried by hand against the seeded dev data.
- Caught along the way:
  - One test compared two separately generated "equal" dates that were a millisecond
    apart; the test was fixed, not the code.
  - Running the formatter over `src/` rewrote line endings in unrelated files (Windows
    checkout); those files were restored so the commit only contains real changes.

## Between Phases 5 and 6 — Web frontend

- **Scope.** The human asked for the frontend before Phase 6. The AI asked three questions:
  scope, interface language and where to keep the token. The human chose everything the API
  supports today, an Arabic RTL interface, and an httpOnly cookie. The AI wrote a plan, and
  the human approved it before any code was written.
- **Next.js 16 changes.** This version renames `middleware` to `proxy` and makes `params`
  and `cookies()` async. The AI had a sub-agent read the docs bundled with Next.js 16
  instead of relying on its training data, and followed those conventions.
- **Skills used:**
  - `frontend-design` for the visual direction.
  - `ui-ux-pro-max`, which the human installed mid-build with `npx skills add`. Before using
    it, the AI read its instructions and scanned its scripts: local data only, no network
    calls.
  - The skill's suggestions were checked for fit, not applied wholesale. Its fonts were
    rejected (Latin-only, no Arabic), and so was its landing-page pattern (Quizora is an
    app). Its form and touch rules were adopted: errors at each field linked with
    `aria-describedby`, focus on the first invalid field, pressed states, and confirmation
    after saving.
- **How it was checked:**
  - `next build` and `lint`, both clean.
  - The whole flow through the web app's own `/api` routes with `curl`: cookie flags, no
    token in any response body, 415 for non-JSON changes, a student refused on teacher
    routes, a forged cookie cleared, and `?from=` rejecting other sites.
  - A scratch script drove headless Edge at 375px over the DevTools protocol through every
    screen, including error states and the locked quiz. It reported horizontal overflow and
    console errors (none), and its screenshots were reviewed. That review found two things,
    which were then fixed: dates shown as `2026/10/08`, and option inputs too narrow on
    phones.
  - The backend test suites were re-run (1 + 92 passing) to confirm the API was untouched.
- **Mistakes caught along the way:**
  - Running the skill's Python script created `__pycache__` files, and the first skill
    commit included them. A follow-up commit untracked them and added them to `.gitignore`;
    history wasn't rewritten.
  - A hand test sent Arabic through `curl` arguments, which Git Bash on Windows mangled
    before sending, so a test quiz was stored with replacement characters. It was traced to
    the test harness (not the app), deleted, and redone with UTF-8 request files, and the
    stored bytes were checked.
  - A `px-3` class that was meant to shrink the delete buttons had no effect, because the
    built-in `px-4` wins. A proper `compact` size replaced it.
  - An early form design would have caused hydration mismatches, because default dates
    depend on the browser's clock and timezone. It was changed so the form renders only in
    the browser.

## Phase 6 — Quiz availability

- **Plan critique before code.** The AI wrote a plan, then had a workflow of 8 read-only
  sub-agents attack it. Four findings were adopted:
  - A student's own attempt is checked before class membership, so a started quiz doesn't
    disappear when the teacher changes its classes.
  - The list and detail queries also include quizzes the student has an attempt on.
  - Phase 5's claim that the first attempt can't overlap an edit "without extra code" was
    wrong. Starting a quiz must lock the quiz row before reading it; this is recorded for
    Phase 7.
  - The list is ordered by opening date, latest first.
- **One finding was not decided by the AI.** Moving the closing date earlier doesn't end
  attempts that are already running. The sub-agents disagreed about whether that's a bug,
  and changing it would alter a Phase 2 rule the human approved. The AI wrote it up as an
  open question. The human chose to keep the rule: an attempt's deadline is fixed when it
  starts. That is recorded in `DECISIONS.md`.
- **What the AI wrote:** the rule as one pure function with 18 unit tests, two read-only
  student routes, and 17 e2e tests covering the brief's five cases. The e2e cases are before
  opening, during, after closing, wrong class and a previous attempt, plus drafts, roles and
  a check that no question text or correct answer reaches students.
- **How it was checked:**
  - Tests: 19 unit tests and 109 e2e tests pass in total. Type-check and lint are clean.
  - Code review: 4 read-only sub-agents looked for rule, security, test and query problems.
    Each finding was then checked by a separate sub-agent trying to refute it (7 sub-agents
    in all). Three findings were raised and all three were refuted as defects. Two still led
    to changes:
    - A real test gap: no test paired an attempt with a quiz outside its window. Unit and
      e2e cases were added. Checking the closing date before the attempt now fails both
      suites.
    - The question put to the human covered the closing date moving *later* as well as
      earlier.
  - Mutation checks. Nine protections were broken on purpose, one at a time (ten runs,
    since the draft filter was tested twice). Each was caught by at least one test:
    - checking the attempt before the window
    - the attempt lookup being limited to the student
    - including quizzes the student has an attempt on
    - checking the attempt before the class
    - the closing time being exclusive
    - the attempt's `expiresAt`
    - the draft filter
    - the student role on the routes
    - building the response field by field
  - Two of those results need context:
    - The closing-time boundary is caught only by the unit tests.
    - Drafts are blocked twice, by the query and by the rule. Removing only the rule's check
      is caught by the unit tests; removing both fails the e2e tests too.
  - Each file was restored byte-for-byte after each mutation.
- **Mistakes caught along the way:**
  - One mutation run was started in the background. The AI stopped it when it seemed stuck,
    but the script had already moved on, so a mutated `availability.ts` briefly sat in the
    working tree. The AI noticed, restored the file from its clean copy, checked it, and
    re-ran the check in the foreground with an automatic restore. The mutated file was
    never committed.
  - The human's `npm run dev:api` was running in watch mode, so it rebuilt and restarted
    each time a mutation touched `src/`. It ended on the restored code. Mutation checks
    should be run while the dev API is stopped.

## Phase 7 — Student quiz flow

- **Scope.** Phase 7 overlaps Phase 8 (timer protection) and Phase 9 (scoring). The AI asked
  how to split them and offered three options. The human chose "the flow plus server-side
  deadline checks; the score comes in Phase 9".
- **Design critique before code.** The AI wrote the API and page design to a file, then had a
  workflow of 23 read-only sub-agents attack it: 4 critics and a separate verifier for each
  finding.
  - 19 findings were raised and 12 survived verification, all of them about the web client.
    They covered answers saved out of order, a lost response treated as a failure, submit
    overtaking saves still in flight, how the timer's clock offset is measured, the phone
    sleeping, and redirects that trap the back button.
  - The API design didn't change. The page and save logic were built around those findings.
- **What the AI wrote:**
  - five API routes, with 24 e2e tests and 6 unit tests
  - four student pages
  - the answer-saving hook
- **Code review after writing.** Another workflow of 23 read-only sub-agents reviewed the
  code: 5 reviewers, and a verifier for each finding.
  - 18 findings were raised and 12 survived, again all in the web client. All 12 were fixed.
    The most serious (high) was a lost response followed by a tap back to the previous
    answer: the page never resent it, so the server kept the other answer.
  - Two refuted findings were missing tests, not bugs: moving the closing date earlier, and
    retrying a submit after the deadline. The AI added those tests anyway, because they guard
    the deadline rule the human chose.
- **Mutation checks.** They ran in an isolated copy of the API, so the human's dev API
  (watch mode) never loaded mutated code. That followed the lesson recorded in Phase 6.
  - 14 protections were broken on purpose, one at a time. The first batch of 13 caught 12.
  - The double-start test didn't actually overlap the two requests, so the duplicate-insert
    handling was never exercised. The AI rewrote it to hold the quiz row locked, the way a
    teacher's edit does, so both starts run together.
  - It also added a test that a start waits for a teacher's edit and uses the edited time
    limit. Removing the `FOR SHARE` lock now fails that test.
  - All 14 are now caught.
- **Browser checks.** A scratch script drove headless Edge at 375px over the DevTools
  protocol. It ran against separate servers on ports 3100/3101 and the test database, not the
  human's dev servers or data. It covered:
  - start, answer, change and clear, each checked against what the server stored
  - five rapid re-taps, which end on the last one
  - going offline, where the tap is kept and saved after reconnecting
  - a response lost after the server saved it, followed by a tap back, where the server ends
    on the tap back
  - a refresh, which restores the answers
  - the submit confirmation, the result page, and the back button
  - the countdown turning red, the automatic move to the result page at zero, and a late save
    refused with 409
  - no horizontal overflow and no console errors
  - The screenshots were reviewed. That found a wrapped "clear answer" button and an Arabic
    grammar slip, and both were fixed.
- **Mistakes caught along the way:**
  - In the browser check, the AI first set a test deadline with the database's `now()`. The
    Docker VM's clock was about 75 seconds ahead of Windows, so the deadline looked broken.
    Tracing it showed the app was right, because it uses only the API's clock; the test was
    fixed. The AI's first measurement of the drift was also wrong (Git Bash's `date` has no
    `%N`) and was redone.
  - Formatting a glob of components rewrote line endings in eight files the AI hadn't changed.
    They were restored so the commit holds only real changes.
  - Lint caught `Date.now()` being called during rendering in the early-closing warning. The
    warning was later replaced by a rule that needs no clock.
  - Adding the new module under `apps/api/src` made the human's dev API rebuild and restart.
    That was expected, and it now serves the new routes.

## Phase 8 — Timer & attempt protection

- **A lighter process from here on.** Before this phase the human replaced the heavy review
  process of Phases 6 and 7 (20+ agent workflows, mutation runs, repeated full suites) with a
  risk-based one:
  - targeted tests while working
  - a review by 2–4 focused agents, with every finding classified MUST FIX NOW, LATER PHASE,
    OPTIONAL or FALSE POSITIVE, and only MUST FIX NOW fixed in the phase
  - no mutation testing by default
  - one full test-suite run before committing

  The AI saved this as a standing rule and followed it here.
- **Plan.** The AI checked the brief against what Phase 7 already enforced. What was left:
  - recording expiry in the database, lazily as decided in Phase 2
  - database CHECKs on attempts
  - edge-case tests: expiry, times sent by the client, reconnect, and deterministic races
    between an answer save and a submit
- **What the AI wrote:**
  - `expireOverdueAttempts()`, called first by every student request
  - a hand-written migration with three CHECKs
  - 13 new e2e tests
  - consistent test fixtures, needed once the CHECKs rejected the old unrealistic rows
- **How it was checked:** during the work, only the affected suites (attempts, student
  quizzes, teacher quizzes), one after another. Then a focused review and one full run (below).
- **Review.** Three read-only agents looked at correctness and concurrency, security and edge
  cases, and tests. The AI checked and classified each finding:
  - **MUST FIX NOW, fixed:**
    - One constraint test built the start and the deadline from two separate `Date.now()`
      calls, so it could flake if the millisecond changed between them. Three agents found
      it.
    - The e2e setup migrated the test database before emptying it. Leftover Phase 7 test
      rows would have made the new CHECKs fail to apply.
  - **FALSE POSITIVE, checked and fine:** whether the expiry step could clash with a submit
    or deadlock, and whether the CHECKs could reject a row the API writes at the time
    boundaries.
- **Final checks:** the full suite was run once (25 unit and 146 e2e tests). The setup fix
  touched every e2e suite, so under the new rules the e2e suite was run once more.
- **Mistakes caught along the way:**
  - For the setup fix, the AI first tried `prisma migrate reset --force` on the test
    database. Prisma refused, because it detects AI agents and requires the user's explicit
    consent. The AI didn't work around that guard. It switched to emptying the tables before
    `migrate deploy`, which is the same deletion the tests already do. The AI also checked
    how a missing database behaves on the first run, using a throwaway script it deleted
    afterwards.
  - Formatting a glob of files again rewrote line endings in four files the AI hadn't
    changed. They were restored, and from now on the AI formats only the files it edits.
  - One test compared a resubmission with the original submission time, but the helper had
    just moved that time into the past on purpose. The behaviour was right, and the test was
    fixed to compare with the stored value.

## Phase 9 — Scoring & negative marking

- **Review depth was the human's choice.** Scoring is on the human's own list of high-risk
  areas. The AI asked, and the human chose the heavier option: 4 focused review agents, an
  independent double-check of every MUST FIX NOW finding, and a small mutation check of the
  scoring function only.
- **What the AI wrote:**
  - `scoreAttempt()`, a pure function in whole hundredths of a point, so the arithmetic is
    exact with no rounding, with 13 unit tests
  - `finalizeAttempt()`, the single place an attempt ends and is scored, used by the submit
    and by the Phase 8 expiry step (which now scores each attempt under its row lock)
  - a migration adding two score CHECKs as `NOT VALID`
  - 11 new e2e tests
  - the score on the result page
- **How it was checked:**
  - **Targeted tests:** 13 unit tests, and the attempts and student-quizzes e2e suites
    (48 and 17 tests).
  - **Mutation check,** in an isolated copy so the human's dev API never loaded it. Ten
    deliberate bugs were introduced into the scoring function, one at a time:
    - no zero floor, and flooring each step instead of the total
    - a penalty that ignores the question's points, and one 100 times too small
    - a correct answer worth 100 times too little
    - duplicate answers counted
    - `-0` stored for a wrong answer when negative marking is off
    - the maximum counting only answered questions
    - wrong answers earning points
    - a penalty applied to correct answers

    The unit tests caught all ten.
- **Review.** Four read-only agents looked at the arithmetic, finalization and concurrency,
  trust and data exposure, and tests. None classified anything MUST FIX NOW, so the
  double-check stage had nothing to verify. The AI made the final classification and upgraded
  two OPTIONAL findings, because both were cheap and concerned the correctness of a score:
  - Reading an attempt took the clock twice. If the deadline fell between the two readings,
    the response said EXPIRED with no score. Three agents found this. It now uses one reading
    per request.
  - Every test quiz listed the correct option first, so a scoring query that read "the first
    option" would have passed every test. The AI added a test where the correct option is
    second, both in position and in insertion order. Its first version only changed the
    position, which the AI noticed would leave a first-inserted regression undetected.
  - Not fixed now:
    - **LATER PHASE (Phase 10):** an attempt whose student never comes back stays unscored
      until something finalizes it.
    - **OPTIONAL:** no test for the re-check under the row lock; one `UPDATE` per answer when
      scoring; the zero-floor rule shown only after the attempt; one half of a CHECK untested.
- **Final checks:** the full suite was run once: 38 unit tests and 158 e2e tests. Lint,
  type-check and the web build were clean.

## Phase 10 — Results & teacher dashboard

- **Plan and assumptions.** The AI read "student performance" as each student's result
  within each of the teacher's quizzes, with no cross-quiz analytics, and wrote that down as
  an assumption. It kept the statistics to status counts, the average, highest and lowest
  score, and right, wrong and blank counts per question. The default review applied (3
  agents, one on authorization, since authorization is on the human's high-risk list), with
  no mutation testing.
- **What the AI wrote:**
  - the teacher results route, which first ends and scores the quiz's overdue attempts,
    closing the item deferred from Phases 8–9
  - pure statistics functions, with 6 unit tests
  - the student's own score in their quiz list, the quiz page and the result page
  - 9 e2e tests: a realistic class taking the quiz through the real API (two submitted,
    one still answering, one not started, and one who left and never came back), with exact
    statistics and authorization checks
  - one more e2e test for the student's own score
  - the teacher results page
- **How it was checked:**
  - Targeted tests: the statistics unit tests, then the teacher-results and student-quizzes
    e2e suites (9 and 18 tests), one after another.
  - A few read-only screenshots at 375px, through the human's running dev server rather than
    new servers (no overflow, no console errors). The development data had no finished
    attempts, so the populated results view is covered by the e2e tests, not by a
    screenshot. The AI didn't create attempts in the human's data.
- **Review.** Three read-only agents looked at authorization, correctness and tests. None
  classified anything MUST FIX NOW. The AI made the final classification and upgraded four
  items, all cheap and all directly about this phase:
  - The student quiz list and page read the clock twice, the same slip fixed in Phase 9 for
    the attempt page. For a few milliseconds a finished quiz could show without its score.
    Two agents found this.
  - No test proved that ownership is checked before the expiry step runs, so a later
    reordering would have let another teacher trigger writes on the quiz.
  - No test proved that the student's list and quiz page finalize a timed-out attempt and
    show its score.
  - No test guarded the teacher results response against leaking account fields such as
    `passwordHash`. It is the first route that returns other users' records.
  - **Not fixed now:**
    - **OPTIONAL:** the per-question counts can disagree with the status counts for a few
      milliseconds at closing time, until the next refresh; the sort-order test would still
      pass without sorting.
    - **LATER PHASE:** the "nobody finished" wording when only pre-scoring attempts exist.
      This affects development data only.
  - **FALSE POSITIVE (checked):**
    - Any teacher can list a class by assigning a quiz to it. The brief has no
      teacher-to-class ownership.
    - A teacher's page view racing a student's submit is safe.
    - A student's score hinting at which answers were right comes with any score, and the
      brief requires scores to be shown.
- **Final checks:** the full suite was run once: 44 unit and 169 e2e tests. Lint, type-check
  and the web build were clean.

## Phase 11 — Arabic & mobile UX

- **How it was done.** The human asked for Phase 11 to follow Phase 10 without stopping in
  between, so it sits on a branch stacked on Phase 10.
  - Two read-only agents audited the web code: one for accessibility and forms, one for
    RTL, Arabic typography and phone layout.
  - A scratch script drove headless Edge through every screen at 375px and 320px, with
    realistic data: a class that had taken the quiz. It ran against the AI's own servers on
    ports 3100/3101 and the test database.
- **What was fixed.** The AI classified the audit's findings itself. It fixed the ones the
  Phase 11 brief names: accessible buttons and forms, clear validation, clear timer, RTL,
  responsive layout and Arabic text (see `DECISIONS.md`):
  - page titles
  - focus handling
  - errors read out with their fields
  - contrast
  - overflow at 320px
  - class-list order in RTL
  - Arabic plurals
  - the timer warning
  - numbering and wording on the results page
  - the three items deferred to this phase: back-link size, stating the zero floor up front,
    and the results-page wording

  It left two OPTIONAL items: the English screen-reader voice for English content, and focus
  handling in the teacher editor.
- **A regression the AI caused and caught.** The global `overflow-wrap: anywhere` rule fixed
  long words, but it also let cramped header items break mid-word: "Quizor/a" and "خرو/ج"
  appeared in the 320px screenshots. The logo and the logout button now never shrink,
  buttons never break inside a word, and below 360px the header shows only the logo's
  bubbles. The re-run showed the header intact.
- **Checks:**
  - Two screenshot runs, with every screen at both widths: no horizontal overflow and no
    console errors.
  - One full test run: 44 unit and 169 e2e tests, all passing. The API didn't change in this
    phase.
  - Lint, type-check and `next build`.
- **Environment note.** The session was interrupted mid-phase. Afterwards, neither the
  human's dev servers nor Docker Desktop was running. The AI's stop command only matched its
  own servers' command lines. The AI started Docker Desktop and the project's Postgres
  container, as the README does, to run the test suite. It didn't restart the human's dev
  servers.

## Phase 12 — Security & edge cases

- **Order.** The human first asked for Phase 13. The AI pointed out that Phase 12 hadn't been
  done and that the brief says not to skip phases. The human chose to do Phase 12 first.
- **Process.** Security is on the human's high-risk list, so the AI used four read-only
  review agents, the top of the normal range, and no mutation testing. Each agent tried to
  break one area:
  - login, tokens, the cookie and the web proxy
  - authorization across every route
  - input validation
  - the business rules

  The AI turned every claim into a failing test, or a real request against its own servers,
  before fixing it. Claims it couldn't reproduce weren't fixed.
- **What was confirmed and fixed** (details in `DECISIONS.md`):
  - online password guessing, answered with a per-username slowdown
  - an open redirect after login, using a tab character
  - the password landing in the URL if the form is submitted before its JavaScript loads
  - cross-site logout
  - the raw token reachable through `/api/Auth/login`
  - a NUL character causing a 500, even on login
  - dates that passed validation but caused a 500 or were stored unreadably
  - unbounded request bodies in the web proxy
  - the example JWT secret being accepted in production

  Two authorization and business-rule reviews found nothing that needed fixing.
- **Accepted, not fixed:** deeply nested JSON (a framework 500 with no effect), taking a lock
  before the ownership check, the lack of a composite foreign key, security headers, stateless
  logout, and teachers seeing class lists by design. The reasons are in `DECISIONS.md`.
- **How it was checked:**
  - The new `security.e2e-spec.ts` (20 tests) walks through the brief's list: every
    protected route without a token and with the wrong role, cross-teacher changes leaving
    the database unchanged, late submission, a second attempt, a fake score, wrong IDs,
    malformed bodies, NUL characters, bad dates, and password guessing.
  - 6 unit tests cover the throttle, with a controllable clock.
  - The web fixes have no automated tests, so they were checked with `curl` against the
    AI's own servers: open redirect, form method, logout, `/api/Auth/login`, a 200 KB body
    both plain and chunked, six wrong logins, and a normal login.
  - One full test run: 50 unit and 189 e2e tests.
- **Mistakes caught along the way:**
  - Two of the AI's new tests were wrong at first, not the app:
    - One broke because an earlier test in the same file had locked a quiz. It now uses a
      fresh quiz.
    - One expected `__proto__` to be rejected with 400. It is safely dropped instead, so the
      test now checks it's dropped and nothing is polluted.
  - A scripted edit of the date pattern silently failed to match because of regex escaping.
    The AI noticed and made the change with an exact edit instead.

## Phase 13 — Automated tests

- **Process.**
  - The AI measured the API's coverage from the e2e tests (about 98% of lines).
  - Two read-only agents audited the brief's priority areas: one for authentication,
    authorization and permissions; one for availability, attempts, timer and scoring. Each
    mapped rule to test, checked the expected values by hand (all were right), and listed
    the rules no test would catch breaking.
  - A final review of the new tests was started, but the human stopped it, so this phase
    has no end-of-phase review.
  - There was no mutation testing, per the human's standing rule. Instead, the new
    open-redirect test was checked once against the old, vulnerable code: it fails there and
    passes on the fix.
- **What the AI added:**
  - **API tests:** 17 new tests (5 unit, 12 e2e), plus stronger assertions in several
    existing ones.
    - Race tests made deterministic with held database locks.
    - Resuming keeps the deadline.
    - The deadline check after the lock, and the expiry re-check.
    - Scoring of an answer that wins a race.
    - The lock after finished attempts, and during a start.
    - Token claims and algorithm.
    - 404 instead of 409 for other teachers.
    - Unknown usernames throttled like real ones.
    - The 100-question cap, publishing safeguards, the unique index.
  - **Web tests:** 15 tests with Node's built-in runner, no new dependencies. Two helpers
    were moved out of route handlers so they could be tested, without changing behaviour.
  - **Commands and docs:** `npm test` at the root, and a README section on running the tests
    and which rule each suite covers.
- **A mistake from Phase 12, found and fixed here.** `test/security.e2e-spec.ts` contained six
  raw NUL bytes where `\u0000` escapes were meant. The tests had still worked, but `grep`
  treated the file as binary.
  - **Cause:** the scripts the AI used to edit files lost one level of backslashes, so the
    `\u0000` it wrote became a real NUL character.
  - **Fix:** the AI's first two repair attempts failed the same way. The third built the
    backslash from its character code. The file now has none, and a scan of the repository
    found no other file with raw NUL bytes.
- **Checks:** one full run of `npm test`: 55 API unit, 201 API e2e and 15 web tests, 271 in
  all, all passing. Lint, type-check and `next build` were clean.
