"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    // JSON, like every change: another website can't send that (see the logout route).
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      variant="quiet"
      className="shrink-0"
      onClick={logout}
      disabled={pending}
    >
      خروج
    </Button>
  );
}
