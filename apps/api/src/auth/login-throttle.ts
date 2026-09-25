// Slows down password guessing on one account without locking its owner out for long.
//
// The first FREE_FAILURES failed logins for a username cost nothing. After that, each new
// attempt must wait after the previous failure: 1, 2, 4, 8, 16, then 30 seconds. Guessing
// drops to about 2,900 tries a day per account, while a student who mistypes their password
// waits at most 30 seconds. A successful login clears the count; failures older than
// FORGET_AFTER_MS are forgotten.
//
// Keyed on the username, not the IP: every request reaches the API from the web server, and
// the whole centre probably shares one address anyway. Unknown usernames count too, so the
// limit doesn't reveal which accounts exist. Kept in memory (one API process, no Redis per
// the brief); a restart forgets it.
const FREE_FAILURES = 5;
const MAX_WAIT_MS = 30_000;
const FORGET_AFTER_MS = 15 * 60_000;
const MAX_TRACKED = 10_000; // prune beyond this, so a flood of made-up names can't grow it forever

type Failures = { count: number; lastAt: number };

export class LoginThrottle {
  private readonly failures = new Map<string, Failures>();

  constructor(private readonly now: () => number = Date.now) {}

  // How long this username must still wait before trying again (0 = it may try now).
  retryAfterMs(username: string): number {
    const entry = this.current(username);
    if (!entry || entry.count < FREE_FAILURES) return 0;
    const wait = Math.min(
      MAX_WAIT_MS,
      1000 * 2 ** (entry.count - FREE_FAILURES),
    );
    return Math.max(0, entry.lastAt + wait - this.now());
  }

  recordFailure(username: string) {
    const entry = this.current(username);
    this.failures.set(username, {
      count: (entry?.count ?? 0) + 1,
      lastAt: this.now(),
    });
    if (this.failures.size > MAX_TRACKED) this.forgetOld();
  }

  recordSuccess(username: string) {
    this.failures.delete(username);
  }

  private current(username: string): Failures | undefined {
    const entry = this.failures.get(username);
    if (entry && this.now() - entry.lastAt > FORGET_AFTER_MS) {
      this.failures.delete(username);
      return undefined;
    }
    return entry;
  }

  private forgetOld() {
    for (const [username, entry] of this.failures) {
      if (this.now() - entry.lastAt > FORGET_AFTER_MS) {
        this.failures.delete(username);
      }
    }
  }
}
