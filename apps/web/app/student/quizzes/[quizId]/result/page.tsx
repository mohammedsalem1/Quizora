"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, buttonClass } from "@/components/ui";
import { ApiError, apiFetch, errorMessagesOf } from "@/lib/api";
import { countLabel, POINTS } from "@/lib/arabic";
import { formatDateTime } from "@/lib/dates";
import type { AttemptView } from "@/lib/types";

export default function AttemptResultPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const router = useRouter();
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    apiFetch<AttemptView>(`/student/quizzes/${quizId}/attempt`)
      .then((view) => {
        // Still running (e.g. the phone's countdown ran a little early): back to the quiz.
        if (view.status === "IN_PROGRESS") {
          router.replace(`/student/quizzes/${quizId}/attempt`);
        } else {
          setAttempt(view);
        }
      })
      .catch((e: unknown) =>
        setLoadError(
          e instanceof ApiError ? e : new ApiError(500, errorMessagesOf(e)),
        ),
      );
  }, [quizId, router]);

  // Screen readers don't notice the page change on their own (every page has the same
  // title), so move focus to the heading once the result is shown.
  useEffect(() => {
    if (attempt) heading.current?.focus();
  }, [attempt]);

  if (loadError) {
    return (
      <Page>
        <Alert>
          {loadError.status === 404 || loadError.status === 400
            ? "لم تبدأ هذا الاختبار بعد."
            : loadError.messages.join(" ")}
        </Alert>
      </Page>
    );
  }
  if (!attempt) {
    return (
      <Page>
        <p className="text-ink-muted" aria-busy="true">
          جارٍ تحميل النتيجة…
        </p>
      </Page>
    );
  }

  const submitted = attempt.status === "SUBMITTED";

  return (
    <Page>
      <header className="flex flex-col gap-2">
        <p dir="auto" className="text-ink-muted">
          {attempt.quiz.title}
        </p>
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-2xl font-semibold focus:outline-none"
        >
          {submitted ? "سلّمت الاختبار" : "انتهى وقت الاختبار"}
        </h1>
        <p className="text-ink-muted">
          {submitted && attempt.submittedAt
            ? `سُلّم ${formatDateTime(attempt.submittedAt)}.`
            : "تُحتسب الإجابات التي حُفظت قبل انتهاء الوقت."}
        </p>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-xl border border-line bg-surface p-4">
        <Fact label="الإجابات">
          أجبت عن <bdi>{attempt.answeredCount}</bdi> من{" "}
          <bdi>{attempt.quiz.questionCount}</bdi>
        </Fact>
        <Fact label="المجموع الكلي">
          {countLabel(attempt.quiz.totalPoints, POINTS)}
        </Fact>
        <Fact label="علامتك">
          {attempt.score === null ? (
            "لم تُحسب بعد."
          ) : (
            <bdi>{attempt.score}</bdi>
          )}
        </Fact>
      </dl>

      <Link
        href="/student"
        className={`${buttonClass("secondary")} self-start`}
      >
        العودة إلى اختباراتي
      </Link>
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      {children}
    </main>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
