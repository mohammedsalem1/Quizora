import { Prisma } from '../generated/prisma/client';
import { scoreAttempt } from './scoring';

type Db = Prisma.TransactionClient;

// Hundredths of a point (exact integers) -> the Decimal(8,2) the database stores.
const toPoints = (hundredths: number) =>
  new Prisma.Decimal(hundredths).div(100);

// Ends an attempt: scores it from its saved answers and writes the final status, score,
// maximum and each answer's points together. It's the only place an attempt stops being
// IN_PROGRESS (a submit, or the time running out), so every finished attempt is scored, and
// the score always comes from the server. The caller must hold the attempt's row lock.
export async function finalizeAttempt(
  tx: Db,
  attemptId: string,
  status: 'SUBMITTED' | 'EXPIRED',
  now: Date,
) {
  const attempt = await tx.quizAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: {
      answers: { select: { id: true, questionId: true, optionId: true } },
      quiz: {
        select: {
          negativeMarkPercent: true,
          questions: {
            select: {
              id: true,
              points: true,
              options: { where: { isCorrect: true }, select: { id: true } },
            },
          },
        },
      },
    },
  });

  const result = scoreAttempt(
    attempt.quiz.questions.map((q) => ({
      id: q.id,
      points: q.points,
      correctOptionId: q.options.at(0)?.id ?? null,
    })),
    attempt.answers,
    attempt.quiz.negativeMarkPercent,
  );

  for (const answer of attempt.answers) {
    await tx.answer.update({
      where: { id: answer.id },
      data: {
        pointsAwarded: toPoints(
          result.awardedHundredths.get(answer.questionId) ?? 0,
        ),
      },
    });
  }
  await tx.quizAttempt.update({
    where: { id: attemptId },
    data: {
      status,
      submittedAt: status === 'SUBMITTED' ? now : null,
      score: toPoints(result.scoreHundredths),
      maxScore: result.maxScore,
    },
  });
}
