import Link from "next/link";
import type { User } from "@/lib/types";
import { LogoutButton } from "./LogoutButton";
import { Logo } from "./ui";

export function AppHeader({ user }: { user: User }) {
  const subtitle =
    user.role === "TEACHER"
      ? "لوحة المعلّم"
      : user.class
        ? `الصف ${user.class.name}`
        : "طالب";

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2">
        <Link
          href="/"
          className="shrink-0 rounded-lg py-2 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Logo compact />
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 text-end leading-tight">
            <p dir="auto" className="truncate font-medium">
              {user.fullName}
            </p>
            <p className="truncate text-sm text-ink-muted">{subtitle}</p>
          </div>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
