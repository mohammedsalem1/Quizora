"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button variant="quiet" onClick={logout} disabled={pending}>
      خروج
    </Button>
  );
}
