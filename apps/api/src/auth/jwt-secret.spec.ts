import { assertUsableJwtSecret } from './jwt-secret';

const LONG_RANDOM = 'q8V2mR7xL0pZ4tN9wC1kY6hB3sJ5dF8u'; // 32 characters

describe('assertUsableJwtSecret', () => {
  it('accepts any secret outside production (local development, tests)', () => {
    expect(() =>
      assertUsableJwtSecret('change-me-in-production', undefined),
    ).not.toThrow();
    expect(() => assertUsableJwtSecret('short', 'development')).not.toThrow();
  });

  it('refuses the example secret in production', () => {
    expect(() =>
      assertUsableJwtSecret('change-me-in-production', 'production'),
    ).toThrow(/JWT_SECRET/);
  });

  it('refuses a secret shorter than 32 characters in production', () => {
    expect(() =>
      assertUsableJwtSecret(LONG_RANDOM.slice(0, 31), 'production'),
    ).toThrow(/JWT_SECRET/);
  });

  it('accepts a long random secret in production', () => {
    expect(() =>
      assertUsableJwtSecret(LONG_RANDOM, 'production'),
    ).not.toThrow();
  });
});
