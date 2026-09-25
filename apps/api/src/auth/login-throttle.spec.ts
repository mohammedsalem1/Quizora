import { LoginThrottle } from './login-throttle';

describe('LoginThrottle', () => {
  let clock: number;
  let throttle: LoginThrottle;
  const fail = (username: string, times: number) => {
    for (let i = 0; i < times; i++) throttle.recordFailure(username);
  };

  beforeEach(() => {
    clock = 1_000_000;
    throttle = new LoginThrottle(() => clock);
  });

  it('lets the first five failures through without waiting', () => {
    fail('s10a01', 4);
    expect(throttle.retryAfterMs('s10a01')).toBe(0);
    fail('s10a01', 1);
    // From the fifth failure on, the next try must wait.
    expect(throttle.retryAfterMs('s10a01')).toBe(1000);
  });

  it('doubles the wait with each further failure, up to 30 seconds', () => {
    const waits: number[] = [];
    for (let failures = 5; failures <= 11; failures++) {
      throttle = new LoginThrottle(() => clock);
      fail('s10a01', failures);
      waits.push(throttle.retryAfterMs('s10a01'));
    }
    expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  it('counts down the wait as time passes', () => {
    fail('s10a01', 6); // must wait 2 s
    clock += 1500;
    expect(throttle.retryAfterMs('s10a01')).toBe(500);
    clock += 500;
    expect(throttle.retryAfterMs('s10a01')).toBe(0);
  });

  it('clears the count after a successful login', () => {
    fail('s10a01', 8);
    throttle.recordSuccess('s10a01');
    expect(throttle.retryAfterMs('s10a01')).toBe(0);
    fail('s10a01', 4);
    expect(throttle.retryAfterMs('s10a01')).toBe(0);
  });

  it('forgets failures after 15 quiet minutes', () => {
    fail('s10a01', 9);
    clock += 15 * 60_000 + 1;
    expect(throttle.retryAfterMs('s10a01')).toBe(0);
    fail('s10a01', 1);
    expect(throttle.retryAfterMs('s10a01')).toBe(0); // counting starts again
  });

  it('keeps each username separate, including unknown ones', () => {
    fail('no-such-user', 7);
    expect(throttle.retryAfterMs('no-such-user')).toBeGreaterThan(0);
    expect(throttle.retryAfterMs('s10a01')).toBe(0);
  });

  it('prunes old entries once it tracks too many usernames, keeping recent ones', () => {
    fail('old-user', 7);
    clock += 16 * 60_000; // older than 15 minutes
    for (let i = 0; i < 10_000; i++) throttle.recordFailure(`user-${i}`);
    fail('recent-user', 7);
    // The size limit triggered a clean-up: the old entry is gone, the recent one kept.
    expect(throttle.retryAfterMs('old-user')).toBe(0);
    expect(throttle.retryAfterMs('recent-user')).toBeGreaterThan(0);
  });
});
