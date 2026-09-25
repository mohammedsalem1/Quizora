import type { AttemptStatus } from '../generated/prisma/client';

// An attempt's deadline is a snapshot taken when it starts (decided in Phase 6): the time
// limit, cut short by the closing date in force at that moment. Later changes to the quiz's
// closing date never touch it.
export function attemptDeadline(
  startedAt: Date,
  timeLimitMinutes: number,
  closesAt: Date,
): Date {
  const byTimeLimit = new Date(startedAt.getTime() + timeLimitMinutes * 60_000);
  return byTimeLimit < closesAt ? byTimeLimit : closesAt;
}

// The status the student sees. An attempt still marked IN_PROGRESS once its time is up is
// over, and is reported as EXPIRED before anything writes that to the database (Phase 8).
export function effectiveStatus(
  attempt: { status: AttemptStatus; expiresAt: Date },
  now: Date,
): AttemptStatus {
  if (attempt.status === 'IN_PROGRESS' && now >= attempt.expiresAt) {
    return 'EXPIRED';
  }
  return attempt.status;
}
