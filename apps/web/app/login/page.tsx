import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { Logo } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "تسجيل الدخول" };

// Only same-site paths, so a crafted ?from= link can't send users to another website.
// The value is parsed the way the browser will parse it: a prefix check alone lets
// "/<tab>/evil.example" through, which the browser reads as "//evil.example".
const SAME_SITE = "http://quizora.invalid";

function safeReturnPath(from: string | string[] | undefined) {
  if (typeof from !== "string" || !from.startsWith("/")) return "/";
  try {
    const url = new URL(from, SAME_SITE);
    if (url.origin !== SAME_SITE) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
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
