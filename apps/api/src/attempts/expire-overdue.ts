import type { Prisma } from '../generated/prisma/client';

// Writes EXPIRED onto this student's attempts whose time is up. There's no background job
// (decided in Phase 2): an attempt is finalized when the server next handles a request from
// its student. Every student request about quizzes or attempts calls this first, with the
// API server's clock.
//
// It's one conditional UPDATE, so it's safe next to a submit happening at the same moment:
// both need the row lock, and Postgres re-checks `status = IN_PROGRESS` after waiting for it,
// so a submitted attempt is never turned into an expired one.
export async function expireOverdueAttempts(
  db: Prisma.TransactionClient,
  studentId: string,
  now: Date,
) {
  await db.quizAttempt.updateMany({
    where: { studentId, status: 'IN_PROGRESS', expiresAt: { lte: now } },
    data: { status: 'EXPIRED' },
  });
}
