"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, inputClass } from "./ui";

export function LoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("أدخل اسم المستخدم وكلمة المرور.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.replace(returnTo);
        router.refresh();
        return;
      }
      setError(
        res.status === 401
          ? "اسم المستخدم أو كلمة المرور غير صحيحة."
          : res.status === 429
            ? "محاولات دخول كثيرة لهذا الحساب. انتظر نصف دقيقة ثم حاول مرة أخرى."
            : "تعذّر تسجيل الدخول الآن. حاول مرة أخرى بعد قليل.",
      );
    } catch {
      setError("تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت.");
    }
    setPending(false);
  }

  return (
    // method="post": if the form is sent before the page's JavaScript has loaded, the browser
    // must not put the password in the URL (history, server logs).
    <form
      method="post"
      onSubmit={onSubmit}
      className="flex flex-col gap-5"
      noValidate
    >
      <Field label="اسم المستخدم" htmlFor="username">
        <input
          id="username"
          name="username"
          dir="ltr"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={inputClass}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </Field>
      <Field label="كلمة المرور" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ الدخول…" : "دخول"}
      </Button>
    </form>
  );
}
