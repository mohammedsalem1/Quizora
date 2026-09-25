import type { PrismaService } from '../prisma/prisma.service';
import { finalizeAttempt } from './finalize';

// Ends and scores attempts whose time is up. There's no background job (decided in Phase 2):
// an attempt is finalized the next time the server reads it. Every student request about
// quizzes or attempts runs this for that student, and a teacher's results page runs it for
// that quiz (so a student who never came back still gets a final score). It always uses the
// API server's clock.
//
// Each attempt is finalized in its own transaction under its row lock, after checking it is
// still running: a submit that got the lock first has already ended it, and a submitted
// attempt is never turned into an expired one.
export async function expireOverdueAttempts(
  prisma: PrismaService,
  scope: { studentId: string } | { quizId: string },
  now: Date,
) {
  const overdue = await prisma.quizAttempt.findMany({
    where: { ...scope, status: 'IN_PROGRESS', expiresAt: { lte: now } },
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
