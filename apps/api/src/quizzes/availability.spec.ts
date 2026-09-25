import {
  AttemptForAvailability,
  quizAvailability,
  QuizForAvailability,
} from './availability';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2030-05-10T09:00:00.000Z');
const at = (offsetHours: number) =>
  new Date(NOW.getTime() + offsetHours * HOUR);

const CLASS_10A = 'class-10a';
const CLASS_10B = 'class-10b';

const quiz = (
  overrides: Partial<QuizForAvailability> = {},
): QuizForAvailability => ({
  publishedAt: at(-48),
  opensAt: at(-1),
  closesAt: at(24),
  classIds: [CLASS_10A],
  ...overrides,
});

const attempt = (
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED',
  expiresAt: Date,
): AttemptForAvailability => ({ status, expiresAt });

describe('quizAvailability', () => {
  describe('without an attempt', () => {
    it('is NOT_OPEN_YET before the quiz opens', () => {
      expect(
        quizAvailability(quiz({ opensAt: at(2) }), CLASS_10A, null, NOW),
      ).toBe('NOT_OPEN_YET');
    });

    it('is AVAILABLE while the quiz is open', () => {
      expect(quizAvailability(quiz(), CLASS_10A, null, NOW)).toBe('AVAILABLE');
    });

    it('is CLOSED after the quiz closes', () => {
      expect(
        quizAvailability(
          quiz({ opensAt: at(-48), closesAt: at(-1) }),
          CLASS_10A,
          null,
          NOW,
        ),
      ).toBe('CLOSED');
    });

    it('opens exactly at opensAt', () => {
      expect(
        quizAvailability(quiz({ opensAt: NOW }), CLASS_10A, null, NOW),
      ).toBe('AVAILABLE');
      expect(
        quizAvailability(
          quiz({ opensAt: new Date(NOW.getTime() + 1) }),
          CLASS_10A,
          null,
          NOW,
        ),
      ).toBe('NOT_OPEN_YET');
    });

    it('closes exactly at closesAt', () => {
      expect(
        quizAvailability(quiz({ closesAt: NOW }), CLASS_10A, null, NOW),
      ).toBe('CLOSED');
      expect(
        quizAvailability(
          quiz({ closesAt: new Date(NOW.getTime() + 1) }),
          CLASS_10A,
          null,
          NOW,
        ),
      ).toBe('AVAILABLE');
    });

    it('is invisible to a student of another class', () => {
      expect(quizAvailability(quiz(), CLASS_10B, null, NOW)).toBeNull();
    });

    it('is visible to every class it is assigned to', () => {
      const shared = quiz({ classIds: [CLASS_10A, CLASS_10B] });
      expect(quizAvailability(shared, CLASS_10A, null, NOW)).toBe('AVAILABLE');
      expect(quizAvailability(shared, CLASS_10B, null, NOW)).toBe('AVAILABLE');
    });

    it('is invisible while it is a draft, even inside its window', () => {
      expect(
        quizAvailability(quiz({ publishedAt: null }), CLASS_10A, null, NOW),
      ).toBeNull();
    });

    it('is invisible to a user without a class', () => {
      expect(quizAvailability(quiz(), null, null, NOW)).toBeNull();
    });
  });

  describe('with a previous attempt', () => {
    it('is IN_PROGRESS while the attempt is still running', () => {
      expect(
        quizAvailability(
          quiz(),
          CLASS_10A,
          attempt('IN_PROGRESS', at(0.25)),
          NOW,
        ),
      ).toBe('IN_PROGRESS');
    });

    it('is FINISHED once the attempt is submitted, even though the quiz is still open', () => {
      expect(
        quizAvailability(
          quiz(),
          CLASS_10A,
          attempt('SUBMITTED', at(0.25)),
          NOW,
        ),
      ).toBe('FINISHED');
    });

    it('is FINISHED once the attempt has expired', () => {
      expect(
        quizAvailability(quiz(), CLASS_10A, attempt('EXPIRED', at(-0.5)), NOW),
      ).toBe('FINISHED');
    });

    it('is FINISHED when an IN_PROGRESS attempt has run out of time but was not finalized yet', () => {
      expect(
        quizAvailability(
          quiz(),
          CLASS_10A,
          attempt('IN_PROGRESS', at(-0.01)),
          NOW,
        ),
      ).toBe('FINISHED');
    });

    it('treats the moment of expiry as over', () => {
      expect(
        quizAvailability(quiz(), CLASS_10A, attempt('IN_PROGRESS', NOW), NOW),
      ).toBe('FINISHED');
    });

    it("stays visible to the student after the teacher removes the student's class", () => {
      const moved = quiz({ classIds: [CLASS_10B] });
      expect(
        quizAvailability(
          moved,
          CLASS_10A,
          attempt('IN_PROGRESS', at(0.25)),
          NOW,
        ),
      ).toBe('IN_PROGRESS');
      expect(
        quizAvailability(moved, CLASS_10A, attempt('SUBMITTED', at(-1)), NOW),
      ).toBe('FINISHED');
    });

    it('is still FINISHED after the quiz closes (not CLOSED), so the result stays reachable', () => {
      const closed = quiz({ opensAt: at(-48), closesAt: at(-1) });
      expect(
        quizAvailability(closed, CLASS_10A, attempt('SUBMITTED', at(-2)), NOW),
      ).toBe('FINISHED');
      expect(
        quizAvailability(closed, CLASS_10A, attempt('EXPIRED', at(-2)), NOW),
      ).toBe('FINISHED');
    });

    it('is decided by the attempt even if the teacher moves the window later', () => {
      const movedLater = quiz({ opensAt: at(2), closesAt: at(26) });
      expect(
        quizAvailability(
          movedLater,
          CLASS_10A,
          attempt('SUBMITTED', at(-1)),
          NOW,
        ),
      ).toBe('FINISHED');
      expect(
        quizAvailability(
          movedLater,
          CLASS_10A,
          attempt('IN_PROGRESS', at(0.25)),
          NOW,
        ),
      ).toBe('IN_PROGRESS');
    });

    it('never offers a second start: a finished attempt is not AVAILABLE again', () => {
      const states = (['SUBMITTED', 'EXPIRED'] as const).map((status) =>
        quizAvailability(quiz(), CLASS_10A, attempt(status, at(-1)), NOW),
      );
      expect(states).toEqual(['FINISHED', 'FINISHED']);
    });
  });
});
