// Checks the web app's /api routes make before forwarding anything to the API. Kept free of
// Next.js imports so they can be tested on their own (request-guards.test.mts).

// Requests that change something carry a body. They must be JSON: a browser can't send a
// cross-site application/json request without CORS approval (which the app never grants),
// so together with the SameSite=Lax cookie this blocks cross-site request forgery.
export function sendsBody(method: string): boolean {
  return method !== "GET" && method !== "DELETE";
}

export function isJson(contentType: string | null): boolean {
  return contentType?.startsWith("application/json") ?? false;
}

// Why a path under /api/… can't be forwarded to the API, as an HTTP status, or null if it
// can. "." and ".." could climb to another API path. Logging in and out have their own
// routes (they keep the token in the cookie); the API's paths ignore letter case, so
// "/api/Auth/login" must not reach its login here and hand the raw token to the browser.
export function proxyPathProblem(path: string[]): 400 | 404 | null {
  if (path.some((segment) => segment === "." || segment === "..")) return 400;
  if (path[0]?.toLowerCase() === "auth") return 404;
  return null;
}
