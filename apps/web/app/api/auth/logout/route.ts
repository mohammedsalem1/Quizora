import { NextResponse } from "next/server";
import { isJson } from "@/lib/request-guards";
import { SESSION_COOKIE } from "@/lib/config";

// JWTs are stateless: logging out means forgetting the token.
export async function POST(request: Request) {
  // Like every other change, logging out must be a JSON request. A cross-site form can't
  // send one, so another website can't log a student out in the middle of a quiz.
  if (!isJson(request.headers.get("content-type"))) {
    return NextResponse.json(
      { message: "Expected application/json" },
      { status: 415 },
    );
  }
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
