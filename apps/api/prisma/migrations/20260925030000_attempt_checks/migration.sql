-- Hand-written constraints on attempts (Phase 8). The API enforces the same rules; these
-- are the last line of defence. Listed at the top of prisma/schema.prisma — keep in sync.

-- An attempt's deadline comes after its start.
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_expiresAt_after_startedAt" CHECK ("expiresAt" > "startedAt");

-- Only a submitted attempt has a submission time (IN_PROGRESS and EXPIRED have none).
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_submittedAt_iff_submitted" CHECK (("status" = 'SUBMITTED') = ("submittedAt" IS NOT NULL));

-- A submission is always before the deadline, so an expired attempt can't be submitted.
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_submittedAt_before_expiresAt" CHECK ("submittedAt" IS NULL OR "submittedAt" < "expiresAt");
