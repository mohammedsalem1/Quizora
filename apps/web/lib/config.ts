// Server-side settings (route handlers, proxy, server components). Never sent to the browser.

export const API_URL = process.env.API_URL ?? "http://localhost:3001";

// The API's JWT lives in this httpOnly cookie, so page JavaScript can't read it.
export const SESSION_COOKIE = "quizora_session";

// Matches the API's token lifetime (12h).
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
