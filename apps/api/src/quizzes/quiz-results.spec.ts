import { summarizeScores, tallyQuestions } from './quiz-results';

describe('summarizeScores', () => {
  it('has nothing to summarize without scored attempts', () => {
    expect(summarizeScores([])).toEqual({
      scored: 0,
      average: null,
      highest: null,
      lowest: null,
    });
  });

  it('gives the count, average, highest and lowest in points', () => {
    // 5, 1.25 and 2 points: average 8.25 / 3 = 2.75
    expect(summarizeScores([500, 125, 200])).toEqual({
      scored: 3,
      average: 2.75,
      highest: 5,
      lowest: 1.25,
    });
  });

  it('rounds only the average, to the nearest hundredth', () => {
    // (1 + 1 + 2) / 3 = 1.333…
    expect(summarizeScores([100, 100, 200]).average).toBe(1.33);
    // (1 + 2 + 2) / 3 = 1.666…
    expect(summarizeScores([100, 200, 200]).average).toBe(1.67);
    // (0.01 + 0.02) / 2 = 0.015, rounded half up
    expect(summarizeScores([1, 2]).average).toBe(0.02);
  });

  it('handles a single attempt and zero scores', () => {
    expect(summarizeScores([0])).toEqual({
      scored: 1,
      average: 0,
      highest: 0,
      lowest: 0,
    });
  });
});

describe('tallyQuestions', () => {
  const questions = [
    { id: 'q1', correctOptionId: 'q1-ok' },
    { id: 'q2', correctOptionId: 'q2-ok' },
  ];

  it('counts correct, wrong and unanswered for each question', () => {
    const finished = [
      { answers: [{ questionId: 'q1', optionId: 'q1-ok' }] },
      {
        answers: [
          { questionId: 'q1', optionId: 'q1-ok' },
          { questionId: 'q2', optionId: 'q2-no' },
        ],
      },
      { answers: [] },
    ];
    expect(tallyQuestions(questions, finished)).toEqual([
      { id: 'q1', correct: 2, wrong: 0, unanswered: 1 },
      { id: 'q2', correct: 0, wrong: 1, unanswered: 2 },
    ]);
  });

  it('is all zeros when nobody has finished', () => {
    expect(tallyQuestions(questions, [])).toEqual([
      { id: 'q1', correct: 0, wrong: 0, unanswered: 0 },
      { id: 'q2', correct: 0, wrong: 0, unanswered: 0 },
    ]);
  });
});
