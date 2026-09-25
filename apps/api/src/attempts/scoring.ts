// How a finished attempt is scored (rules decided in Phase 2):
// - a correct answer earns the question's points;
// - a wrong answer loses `negativeMarkPercent` % of that question's points (0 = no negative
//   marking, set per quiz by its teacher);
// - an unanswered question earns 0;
// - the quiz total never goes below 0. Each wrong answer still counts in the sum, so wrong
//   answers can cancel out correct ones, but the result is never negative.
//
// Everything is counted in whole hundredths of a point. Points and the percentage are whole
// numbers, so a penalty (points × percent / 100) always has at most two decimals and is exact
// in hundredths: no rounding, no floating-point error.

export type ScoringQuestion = {
  id: string;
  points: number;
  correctOptionId: string | null; // null never happens for a published quiz
};

export type ScoringAnswer = { questionId: string; optionId: string };

export type AttemptScore = {
  scoreHundredths: number; // the total, never below 0
  maxScore: number; // whole points: every question answered correctly
  awardedHundredths: Map<string, number>; // per answered question: + or − hundredths
};

export function scoreAttempt(
  questions: ScoringQuestion[],
  answers: ScoringAnswer[],
  negativeMarkPercent: number,
): AttemptScore {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const awarded = new Map<string, number>();
  let total = 0;

  for (const answer of answers) {
    const question = byId.get(answer.questionId);
    // Another quiz's question, or a second answer to the same one, never counts.
    if (!question || awarded.has(question.id)) continue;

    const penalty = question.points * negativeMarkPercent; // hundredths
    const points =
      answer.optionId === question.correctOptionId
        ? question.points * 100
        : penalty === 0
          ? 0
          : -penalty;
    awarded.set(question.id, points);
    total += points;
  }

  return {
    scoreHundredths: Math.max(0, total),
    maxScore: questions.reduce((sum, q) => sum + q.points, 0),
    awardedHundredths: awarded,
  };
}
