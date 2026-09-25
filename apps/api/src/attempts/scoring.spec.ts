import { scoreAttempt, ScoringQuestion } from './scoring';

// Three questions worth 1, 2 and 3 points (6 in total). The correct option of each is "<id>-ok".
const QUESTIONS: ScoringQuestion[] = [
  { id: 'q1', points: 1, correctOptionId: 'q1-ok' },
  { id: 'q2', points: 2, correctOptionId: 'q2-ok' },
  { id: 'q3', points: 3, correctOptionId: 'q3-ok' },
];
const right = (id: string) => ({ questionId: id, optionId: `${id}-ok` });
const wrong = (id: string) => ({ questionId: id, optionId: `${id}-no` });

// The score in points, e.g. 4.25, from exact hundredths.
const points = (
  answers: { questionId: string; optionId: string }[],
  percent: number,
) => scoreAttempt(QUESTIONS, answers, percent).scoreHundredths / 100;

describe('scoreAttempt', () => {
  it("all correct: every question's points", () => {
    const all = [right('q1'), right('q2'), right('q3')];
    expect(points(all, 0)).toBe(6);
    expect(points(all, 25)).toBe(6);
  });

  it('all incorrect, without negative marking: 0', () => {
    expect(points([wrong('q1'), wrong('q2'), wrong('q3')], 0)).toBe(0);
  });

  it('all incorrect, with negative marking: never below 0', () => {
    const result = scoreAttempt(
      QUESTIONS,
      [wrong('q1'), wrong('q2'), wrong('q3')],
      25,
    );
    expect(result.scoreHundredths).toBe(0);
    // Each wrong answer still records its own deduction.
    expect([...result.awardedHundredths.values()]).toEqual([-25, -50, -75]);
  });

  it('unanswered questions earn 0 and cost nothing, even with negative marking', () => {
    expect(points([], 50)).toBe(0);
    expect(points([right('q3')], 50)).toBe(3);
    expect(
      scoreAttempt(QUESTIONS, [right('q3')], 50).awardedHundredths,
    ).toEqual(new Map([['q3', 300]]));
  });

  it('mixed answers without negative marking: only correct answers count', () => {
    expect(points([right('q1'), wrong('q2'), right('q3')], 0)).toBe(4);
  });

  it('mixed answers with negative marking: a wrong answer loses that % of its own points', () => {
    // +1 − 25% of 2 + 3 = 3.5
    expect(points([right('q1'), wrong('q2'), right('q3')], 25)).toBe(3.5);
    // +3 − 33% of 1 − 33% of 2 = 3 − 0.33 − 0.66 = 2.01 (exact, no rounding)
    expect(points([wrong('q1'), wrong('q2'), right('q3')], 33)).toBe(2.01);
  });

  it('with 100% negative marking a wrong answer costs its full points', () => {
    // +3 − 1 − 2 = 0
    expect(points([right('q3'), wrong('q1'), wrong('q2')], 100)).toBe(0);
    // +3 − 2 = 1
    expect(points([right('q3'), wrong('q2')], 100)).toBe(1);
  });

  it('keeps a positive total when deductions are smaller', () => {
    // +3 − 50% of 1 = 2.5
    expect(points([right('q3'), wrong('q1')], 50)).toBe(2.5);
  });

  it('gives the maximum as whole points', () => {
    expect(scoreAttempt(QUESTIONS, [], 0).maxScore).toBe(6);
  });

  it('records what each answered question earned, in hundredths', () => {
    const result = scoreAttempt(QUESTIONS, [right('q1'), wrong('q2')], 25);
    expect(result.awardedHundredths).toEqual(
      new Map([
        ['q1', 100],
        ['q2', -50],
      ]),
    );
    expect(result.scoreHundredths).toBe(50);
  });

  it("ignores answers to other quizzes' questions and second answers to a question", () => {
    const result = scoreAttempt(
      QUESTIONS,
      [right('q1'), { questionId: 'other', optionId: 'x' }, wrong('q1')],
      100,
    );
    expect(result.scoreHundredths).toBe(100);
    expect([...result.awardedHundredths.keys()]).toEqual(['q1']);
  });

  it('never marks an answer correct when a question has no correct option', () => {
    const noCorrect: ScoringQuestion[] = [
      { id: 'q', points: 2, correctOptionId: null },
    ];
    expect(
      scoreAttempt(noCorrect, [{ questionId: 'q', optionId: 'q-ok' }], 0)
        .scoreHundredths,
    ).toBe(0);
  });

  it('records a 0 (not −0) for a wrong answer without negative marking', () => {
    const result = scoreAttempt(QUESTIONS, [wrong('q2')], 0);
    expect(Object.is(result.awardedHundredths.get('q2'), 0)).toBe(true);
  });
});
