-- Hand-written constraints on scores (Phase 9). The API computes every score; these are the
-- last line of defence. Listed at the top of prisma/schema.prisma — keep in sync.
--
-- NOT VALID: Postgres checks every row written from now on, but not the rows already there,
-- so attempts that finished before scoring existed (score still null) don't block this
-- migration. They show "not calculated yet".

-- A finished attempt has a score and a maximum; a running one has neither.
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_scored_iff_finished" CHECK (("status" = 'IN_PROGRESS') = ("score" IS NULL) AND ("score" IS NULL) = ("maxScore" IS NULL)) NOT VALID;

-- A score is between 0 and the maximum.
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_score_in_range" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= "maxScore")) NOT VALID;
