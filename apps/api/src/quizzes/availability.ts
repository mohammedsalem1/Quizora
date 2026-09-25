import type { AttemptStatus } from '../generated/prisma/client';

// Where a quiz stands for one student. Always decided on the server, with the server clock.
export type QuizState =
  | 'NOT_OPEN_YET' // published and assigned, but it hasn't opened yet
  | 'AVAILABLE' // open, and the student hasn't started it: they may start
  | 'IN_PROGRESS' // the student's attempt is still running: they may resume it
  | 'FINISHED' // the student's attempt was submitted or has run out of time
  | 'CLOSED'; // the quiz has closed and the student never started it

export type QuizForAvailability = {
  publishedAt: Date | null;
  opensAt: Date;
  closesAt: Date;
  classIds: string[];
};

export type AttemptForAvailability = {
  status: AttemptStatus;
  expiresAt: Date;
} | null;

// Returns null when the student can't see the quiz at all: a draft, or a quiz that isn't
// assigned to their class. Endpoints turn null into 404, so its existence isn't revealed.
//
// The student's own attempt is checked first: once they've started, the quiz stays theirs
// (to resume, and later to see the result) even if the teacher changes its classes.
// The window is open from opensAt (inclusive) to closesAt (exclusive).
export function quizAvailability(
  quiz: QuizForAvailability,
  studentClassId: string | null,
  attempt: AttemptForAvailability,
  now: Date,
): QuizState | null {
  if (attempt) {
    const running = attempt.status === 'IN_PROGRESS' && now < attempt.expiresAt;
    return running ? 'IN_PROGRESS' : 'FINISHED';
  }

  const visible =
    quiz.publishedAt !== null &&
    studentClassId !== null &&
    quiz.classIds.includes(studentClassId);
  if (!visible) return null;

  if (now < quiz.opensAt) return 'NOT_OPEN_YET';
  if (now < quiz.closesAt) return 'AVAILABLE';
  return 'CLOSED';
}
