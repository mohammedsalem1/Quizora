"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  QuizSettingsForm,
  type QuizSettingsPayload,
} from "@/components/QuizSettingsForm";
import { ErrorList } from "@/components/ui";
import { apiFetch, errorMessagesOf } from "@/lib/api";
import type { ClassRef, QuizDetail } from "@/lib/types";

export default function NewQuizPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassRef[] | null>(null);
  const [error, setError] = useState<string[] | null>(null);

  useEffect(() => {
    apiFetch<ClassRef[]>("/classes")
      .then(setClasses)
      .catch((e: unknown) => setError(errorMessagesOf(e)));
  }, []);

  async function create(payload: QuizSettingsPayload) {
    const quiz = await apiFetch<QuizDetail>("/teacher/quizzes", {
      method: "POST",
      body: payload,
    });
    router.push(`/teacher/quizzes/${quiz.id}`);
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <Link
        href="/teacher"
        className="inline-flex min-h-11 items-center self-start rounded-lg text-sm font-medium text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-accent"
      >
        العودة إلى اختباراتي
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">اختبار جديد</h1>
        <p className="text-ink-muted">
          ابدأ بالإعدادات، ثم أضف الأسئلة في الخطوة التالية. يبقى الاختبار مسودة
          لا يراها الطلاب حتى تنشره.
        </p>
      </div>

      <ErrorList messages={error} />
      {classes === null && !error && (
        <p className="text-ink-muted" aria-busy="true">
          جارٍ التحميل…
        </p>
      )}
      {classes && (
        <section className="rounded-xl border border-line bg-surface p-4">
          <QuizSettingsForm
            classes={classes}
            submitLabel="إنشاء الاختبار"
            onSubmit={create}
            onCancel={() => router.push("/teacher")}
          />
        </section>
      )}
    </main>
  );
}
