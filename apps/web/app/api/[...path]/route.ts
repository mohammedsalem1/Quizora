import { NextResponse, type NextRequest } from "next/server";
import { readLimitedBody } from "@/lib/body";
import { API_URL, SESSION_COOKIE } from "@/lib/config";

// Forwards /api/<path> to the NestJS API at /<path>, adding the JWT from the httpOnly
// cookie. It's only a transport: the API does all authentication and authorization.
async function forward(
  request: NextRequest,
  ctx: RouteContext<"/api/[...path]">,
) {
  const { path } = await ctx.params;
  if (path.some((segment) => segment === "." || segment === "..")) {
    return NextResponse.json({ message: "Invalid path" }, { status: 400 });
  }
  // Logging in and out have their own routes (they keep the token in the cookie). The API's
  // paths ignore letter case, so /api/Auth/login would otherwise reach the API's login here
  // and hand the raw token to the browser.
  if (path[0]?.toLowerCase() === "auth") {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const sendsBody = request.method !== "GET" && request.method !== "DELETE";
  // Browsers can't send a cross-site application/json request without CORS approval
  // (which the app never grants), so this plus SameSite=Lax blocks CSRF.
  if (
    sendsBody &&
    !request.headers.get("content-type")?.startsWith("application/json")
  ) {
    return NextResponse.json(
      { message: "Expected application/json" },
      { status: 415 },
    );
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const url = new URL(
    `/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
    API_URL,
  );

  const body = sendsBody ? await readLimitedBody(request) : undefined;
  if (body === null) {
    return NextResponse.json({ message: "Request too large" }, { status: 413 });
  }

  let apiResponse: Response;
  try {
    apiResponse = await fetch(url, {
      method: request.method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(sendsBody ? { "Content-Type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "API unavailable" }, { status: 502 });
  }

  const response = new NextResponse(
    apiResponse.status === 204 ? null : await apiResponse.text(),
    {
      status: apiResponse.status,
      headers: {
        "Content-Type":
          apiResponse.headers.get("content-type") ?? "application/json",
      },
    },
  );
  // The token is expired or the account is gone: drop the cookie so the user logs in again.
  if (apiResponse.status === 401) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
