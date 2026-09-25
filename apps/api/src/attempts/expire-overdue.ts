import type { PrismaService } from '../prisma/prisma.service';
import { finalizeAttempt } from './finalize';

// Ends and scores this student's attempts whose time is up. There's no background job
// (decided in Phase 2): an attempt is finalized when the server next handles a request from
// its student. Every student request about quizzes or attempts calls this first, with the
// API server's clock.
//
// Each attempt is finalized in its own transaction under its row lock, after checking it is
// still running: a submit that got the lock first has already ended it, and a submitted
// attempt is never turned into an expired one.
export async function expireOverdueAttempts(
  prisma: PrismaService,
  studentId: string,
  now: Date,
) {
  const overdue = await prisma.quizAttempt.findMany({
    where: { studentId, status: 'IN_PROGRESS', expiresAt: { lte: now } },
    select: { id: true },
  });

  for (const { id } of overdue) {
    await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM "QuizAttempt" WHERE id = ${id} FOR UPDATE`;
      if (row?.status !== 'IN_PROGRESS') return;
      await finalizeAttempt(tx, id, 'EXPIRED', now);
    });
  }
}
