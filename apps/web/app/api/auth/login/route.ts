import { NextResponse } from "next/server";
import { readLimitedBody } from "@/lib/body";
import { API_URL, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/config";

// Logs in through the API and keeps the returned JWT in an httpOnly cookie.
// The browser gets the user's profile back, never the token.
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json(
      { message: "Expected application/json" },
      { status: 415 },
    );
  }

  const body = await readLimitedBody(request);
  if (body === null) {
    return NextResponse.json({ message: "Request too large" }, { status: 413 });
  }

  let apiResponse: Response;
  try {
    apiResponse = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "API unavailable" }, { status: 502 });
  }

  const data = (await apiResponse.json().catch(() => null)) as {
    accessToken?: string;
    user?: unknown;
  } | null;
  if (!apiResponse.ok || !data?.accessToken) {
    return NextResponse.json(data ?? { message: "Login failed" }, {
      status: apiResponse.ok ? 502 : apiResponse.status,
    });
  }

  const response = NextResponse.json({ user: data.user });
  response.cookies.set(SESSION_COOKIE, data.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
