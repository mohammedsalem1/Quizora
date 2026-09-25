// The example secret from .env.example is public in the repository: anyone could sign tokens
// with it. In production the API refuses to start with it, or with any short secret.
const EXAMPLE_SECRET = 'change-me-in-production';
const MIN_PRODUCTION_LENGTH = 32;

export function assertUsableJwtSecret(
  secret: string,
  nodeEnv: string | undefined,
) {
  if (nodeEnv !== 'production') return;
  if (secret.length < MIN_PRODUCTION_LENGTH || secret === EXAMPLE_SECRET) {
    throw new Error(
      'JWT_SECRET must be a long random value (32+ characters) in production',
    );
  }
}
