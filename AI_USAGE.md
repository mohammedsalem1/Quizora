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
