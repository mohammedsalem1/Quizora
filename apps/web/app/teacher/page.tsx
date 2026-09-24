"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { quizStatus, QuizStatusBadge } from "@/components/QuizStatusBadge";
import { buttonClass, ErrorList } from "@/components/ui";
import { apiFetch, errorMessagesOf } from "@/lib/api";
import { ATTEMPTS, countLabel, QUESTIONS } from "@/lib/arabic";
import { formatDateTime } from "@/lib/dates";
import type { QuizSummary } from "@/lib/types";

// The next date that matters for each quiz, depending on where it is in its life.
function keyDate(quiz: QuizSummary) {
  const status = quizStatus(quiz);
  if (status === "open") return `يُغلق ${formatDateTime(quiz.closesAt)}`;
  if (status === "closed") return `أُغلق ${formatDateTime(quiz.closesAt)}`;
  return `يُفتح ${formatDateTime(quiz.opensAt)}`;
}

export default function TeacherQuizzesPage() {
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [error, setError] = useState<string[] | null>(null);

  useEffect(() => {
    apiFetch<QuizSummary[]>("/teacher/quizzes")
      .then(setQuizzes)
      .catch((e: unknown) => setError(errorMessagesOf(e)));
  }, []);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">اختباراتي</h1>
        <Link href="/teacher/quizzes/new" className={buttonClass("primary")}>
          اختبار جديد
        </Link>
      </div>

      <ErrorList messages={error} />

      {quizzes === null && !error && (
        <p className="text-ink-muted" aria-busy="true">
          جارٍ تحميل الاختبارات…
        </p>
      )}

      {quizzes?.length === 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center">
          <p className="font-medium">لم تُنشئ أي اختبار بعد.</p>
          <p className="text-ink-muted">
            أنشئ اختباراً، وأضف أسئلته، ثم انشره لصفوفك.
          </p>
        </div>
      )}

      {quizzes && quizzes.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {quizzes.map((quiz) => (
            <li key={quiz.id}>
              <Link
                href={`/teacher/quizzes/${quiz.id}`}
                className="flex flex-col gap-2 px-4 py-4 hover:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-line/40"
              >
                <span className="flex items-start justify-between gap-3">
                  <span dir="auto" className="font-medium leading-7">
                    {quiz.title}
                  </span>
                  <QuizStatusBadge quiz={quiz} />
                </span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                  <span>
                    الصفوف:{" "}
                    <bdi>{quiz.classes.map((c) => c.name).join("، ")}</bdi>
                  </span>
                  <span>
                    {quiz.questionCount === 0
                      ? "لا أسئلة بعد"
                      : countLabel(quiz.questionCount, QUESTIONS)}
                  </span>
                  <span>{keyDate(quiz)}</span>
                  {quiz.attemptCount > 0 && (
                    <span>{countLabel(quiz.attemptCount, ATTEMPTS)}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
