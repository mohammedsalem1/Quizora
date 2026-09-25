import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { Logo } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "تسجيل الدخول" };

// Only same-site paths, so a crafted ?from= link can't send users to another website.
function safeReturnPath(from: string | string[] | undefined) {
  if (typeof from !== "string") return "/";
  if (!from.startsWith("/") || from.startsWith("//") || from.startsWith("/\\"))
    return "/";
  return from;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { from } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col gap-3">
        <Logo />
        <h1 className="text-2xl font-semibold">تسجيل الدخول</h1>
        <p className="text-ink-muted">
          استخدم اسم المستخدم وكلمة المرور اللذين حصلت عليهما من المركز.
        </p>
      </div>
      <LoginForm returnTo={safeReturnPath(from)} />
    </main>
  );
}
