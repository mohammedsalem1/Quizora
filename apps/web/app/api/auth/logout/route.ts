import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/config";

// JWTs are stateless: logging out means forgetting the token.
export async function POST() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
