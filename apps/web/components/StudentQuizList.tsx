"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, errorMessagesOf } from "@/lib/api";
import { countLabel, MINUTES, QUESTIONS } from "@/lib/arabic";
import type { StudentQuiz, StudentQuizState } from "@/lib/types";
import { keyDate, StudentQuizStateBadge } from "./StudentQuizState";
import { ErrorList } from "./ui";

// Three groups, in the order a student cares about them.
const GROUPS: { title: string; states: StudentQuizState[]; empty: string }[] = [
  {
    title: "متاح الآن",
    states: ["IN_PROGRESS", "AVAILABLE"],
    empty: "لا يوجد اختبار مفتوح الآن.",
  },
  {
    title: "قريباً",
    states: ["NOT_OPEN_YET"],
    empty: "لا توجد اختبارات مجدولة.",
  },
  {
    title: "السابقة",
    states: ["FINISHED", "CLOSED"],
    empty: "لا توجد اختبارات سابقة.",
  },
];

export function StudentQuizList() {
  const [quizzes, setQuizzes] = useState<StudentQuiz[] | null>(null);
  const [error, setError] = useState<string[] | null>(null);

  useEffect(() => {
    apiFetch<StudentQuiz[]>("/student/quizzes")
      .then(setQuizzes)
      .catch((e: unknown) => setError(errorMessagesOf(e)));
  }, []);

  if (error) return <ErrorList messages={error} />;
  if (!quizzes) {
    return (
      <p className="text-ink-muted" aria-busy="true">
        جارٍ تحميل الاختبارات…
      </p>
    );
  }
  if (quizzes.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center">
        <p className="font-medium">لا توجد اختبارات لصفّك بعد.</p>
        <p className="text-ink-muted">ستظهر هنا عندما ينشرها معلّموك.</p>
      </div>
    );
  }

  return GROUPS.map((group) => {
    // In progress first, then by the API's order (latest opening first).
    const items = quizzes
      .filter((q) => group.states.includes(q.state))
      .sort(
        (a, b) => group.states.indexOf(a.state) - group.states.indexOf(b.state),
      );
    return (
      <section key={group.title} className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{group.title}</h2>
        {items.length === 0 ? (
          <p className="text-sm text-ink-muted">{group.empty}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {items.map((quiz) => (
              <li key={quiz.id}>
                <Link
                  href={`/student/quizzes/${quiz.id}`}
                  className="flex flex-col gap-2 px-4 py-4 hover:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-line/40"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span dir="auto" className="font-medium leading-7">
                      {quiz.title}
                    </span>
                    <StudentQuizStateBadge state={quiz.state} />
                  </span>
                  <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                    <span>{countLabel(quiz.questionCount, QUESTIONS)}</span>
                    <span>{countLabel(quiz.timeLimitMinutes, MINUTES)}</span>
                    <span>{keyDate(quiz)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  });
}
