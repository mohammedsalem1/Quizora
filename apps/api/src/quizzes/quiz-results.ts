// Basic statistics for a quiz's results page. Nothing more is computed on purpose: the brief
// asks for useful basic statistics, not analytics.

export type ScoreSummary = {
  scored: number; // finished attempts that have a score
  average: number | null; // rounded to the nearest hundredth of a point
  highest: number | null;
  lowest: number | null;
};

// Scores come in as whole hundredths of a point (exact, like the stored Decimal(8,2)), so
// only the average needs rounding.
export function summarizeScores(scoresHundredths: number[]): ScoreSummary {
  if (scoresHundredths.length === 0) {
    return { scored: 0, average: null, highest: null, lowest: null };
  }
  const total = scoresHundredths.reduce((sum, s) => sum + s, 0);
  return {
    scored: scoresHundredths.length,
    average: Math.round(total / scoresHundredths.length) / 100,
    highest: Math.max(...scoresHundredths) / 100,
    lowest: Math.min(...scoresHundredths) / 100,
  };
}

export type QuestionTally = {
  id: string;
  correct: number;
  wrong: number;
  unanswered: number;
};

// For each question, how the finished attempts answered it.
export function tallyQuestions(
  questions: { id: string; correctOptionId: string | null }[],
  finished: { answers: { questionId: string; optionId: string }[] }[],
): QuestionTally[] {
  return questions.map((question) => {
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    for (const attempt of finished) {
      const answer = attempt.answers.find((a) => a.questionId === question.id);
      if (!answer) unanswered++;
      else if (answer.optionId === question.correctOptionId) correct++;
      else wrong++;
    }
    return { id: question.id, correct, wrong, unanswered };
  });
}
