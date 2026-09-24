import { cookies } from "next/headers";
import { cache } from "react";
import { API_URL, SESSION_COOKIE } from "./config";
import type { User } from "./types";

// The logged-in user according to the API (the cookie alone proves nothing).
// Server Components only. cache() makes a layout and its page share one API call.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null; // expired, forged or deleted account
  return (await res.json()) as User;
});
