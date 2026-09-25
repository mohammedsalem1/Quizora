import { statusMessage, translateApiMessage } from "./messages";

// Client-side calls to the API, always through this app's /api/* routes (which attach the
// session cookie's token). Errors come back as ApiError with Arabic messages.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly messages: string[],
  ) {
    super(messages.join("\n"));
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// Set once the session has ended and the app is taking the user to the login page, so pages
// don't hold that navigation back with a "leave this page?" prompt.
let redirectingToLogin = false;
export const isRedirectingToLogin = () => redirectingToLogin;

export async function apiFetch<T>(
  path: string,
  options: { method?: Method; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const sendsBody = method !== "GET" && method !== "DELETE";

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: sendsBody ? { "Content-Type": "application/json" } : undefined,
      body: sendsBody ? JSON.stringify(options.body ?? {}) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, [statusMessage(0)]);
  }

  if (res.status === 401) {
    redirectingToLogin = true;
    // Session expired (or the account was removed): start again from the login page. A full
    // page load on purpose, so no state from the old session survives in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(
      `/login?from=${encodeURIComponent(window.location.pathname)}`,
    );
    throw new ApiError(401, ["انتهت الجلسة. سجّل الدخول مرة أخرى."]);
  }

  const data: unknown =
    res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, errorMessages(res.status, data));
  return data as T;
}

function errorMessages(status: number, data: unknown): string[] {
  const raw = (data as { message?: unknown } | null)?.message;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const translated = list.map((m) => translateApiMessage(String(m)));
  if (translated.length === 0 || translated.some((m) => m === null)) {
    return [statusMessage(status)];
  }
  return translated as string[];
}

export function errorMessagesOf(error: unknown): string[] {
  return error instanceof ApiError ? error.messages : [statusMessage(500)];
}
