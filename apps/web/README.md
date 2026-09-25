# Quizora web app

The Next.js frontend of Quizora: an Arabic, right-to-left, mobile-first interface for
students and teachers. Setup, commands and the list of pages are in the
[root README](../../README.md); the reasoning behind them is in
[DECISIONS.md](../../DECISIONS.md).

Run commands from the repository root (`npm run dev:web`, `npm run test:web`, …). In this
folder:

| Path | What's in it |
|---|---|
| `.env.example` | `API_URL`, where the web server reaches the API (copy to `.env`) |
| `app/` | Pages, and the `/api/*` route handlers that log in, log out and forward requests to the API |
| `components/` | Shared UI |
| `lib/` | Answer saving, formatting, request guards, and their tests (`*.test.mts`) |
| `proxy.ts` | Sends visitors without a session cookie to the login page |

The browser never calls the API directly and never sees the login token: it lives in an
httpOnly cookie, and every rule is enforced by the API.
