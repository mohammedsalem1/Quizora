import { attemptDeadline, effectiveStatus } from './attempt-rules';

const at = (time: string) => new Date(`2030-05-10T${time}:00.000Z`);

describe('attemptDeadline', () => {
  it('is the start plus the time limit when the quiz closes later', () => {
    expect(attemptDeadline(at('09:00'), 20, at('12:00'))).toEqual(at('09:20'));
  });

  it('is cut short by the closing date', () => {
    // Starts at 09:55 with 20 minutes allowed, but the quiz closes at 10:00.
    expect(attemptDeadline(at('09:55'), 20, at('10:00'))).toEqual(at('10:00'));
  });

  it('is the closing date when both are the same moment', () => {
    expect(attemptDeadline(at('09:40'), 20, at('10:00'))).toEqual(at('10:00'));
  });
});

describe('effectiveStatus', () => {
  const running = { status: 'IN_PROGRESS' as const, expiresAt: at('10:00') };

  it('is IN_PROGRESS before the deadline', () => {
    expect(effectiveStatus(running, at('09:59'))).toBe('IN_PROGRESS');
  });

  it('is EXPIRED from the deadline on, even if the row still says IN_PROGRESS', () => {
    expect(effectiveStatus(running, at('10:00'))).toBe('EXPIRED');
    expect(effectiveStatus(running, at('11:00'))).toBe('EXPIRED');
  });

  it('keeps SUBMITTED and EXPIRED as they are', () => {
    const later = at('11:00');
    expect(
      effectiveStatus({ status: 'SUBMITTED', expiresAt: at('10:00') }, later),
    ).toBe('SUBMITTED');
    expect(
      effectiveStatus({ status: 'EXPIRED', expiresAt: at('10:00') }, later),
    ).toBe('EXPIRED');
  });
});
