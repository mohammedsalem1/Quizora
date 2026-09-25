import { NextResponse, type NextRequest } from "next/server";
import { readLimitedBody } from "@/lib/body";
import { API_URL, SESSION_COOKIE } from "@/lib/config";
import { isJson, proxyPathProblem, sendsBody } from "@/lib/request-guards";

// Forwards /api/<path> to the NestJS API at /<path>, adding the JWT from the httpOnly
// cookie. It's only a transport: the API does all authentication and authorization.
async function forward(
  request: NextRequest,
  ctx: RouteContext<"/api/[...path]">,
) {
  const { path } = await ctx.params;
  const pathProblem = proxyPathProblem(path);
  if (pathProblem === 400) {
    return NextResponse.json({ message: "Invalid path" }, { status: 400 });
  }
  if (pathProblem === 404) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const withBody = sendsBody(request.method);
  if (withBody && !isJson(request.headers.get("content-type"))) {
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

  const body = withBody ? await readLimitedBody(request) : undefined;
  if (body === null) {
    return NextResponse.json({ message: "Request too large" }, { status: 413 });
  }

  let apiResponse: Response;
  try {
    apiResponse = await fetch(url, {
      method: request.method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(withBody ? { "Content-Type": "application/json" } : {}),
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
