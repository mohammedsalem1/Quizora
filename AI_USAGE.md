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
  and changing it would alter a Phase 2 rule the human approved. It's written up as an open
  question in `DECISIONS.md` for the human.
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
    - The open question for the human now covers the closing date moving *later* as well
      as earlier.
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
