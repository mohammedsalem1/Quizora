"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Alert, Badge, Button } from "@/components/ui";
import { ApiError, apiFetch, errorMessagesOf } from "@/lib/api";
import { countLabel, POINTS } from "@/lib/arabic";
import { formatDateTime } from "@/lib/dates";
import { formatPoints } from "@/lib/numbers";
import type { QuizResults, ResultStatus } from "@/lib/types";

const STATUS_LABELS: Record<ResultStatus, string> = {
  SUBMITTED: "سلّم",
  EXPIRED: "انتهى وقته",
  IN_PROGRESS: "يحلّ الآن",
  NOT_STARTED: "لم يبدأ",
};

const STATUS_TONES = {
  SUBMITTED: "accent",
  EXPIRED: "neutral",
  IN_PROGRESS: "solid",
  NOT_STARTED: "muted",
} as const;

export default function QuizResultsPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const path = `/teacher/quizzes/${quizId}/results`;
  const [results, setResults] = useState<QuizResults | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const asApiError = (e: unknown) =>
    e instanceof ApiError ? e : new ApiError(500, errorMessagesOf(e));

  useEffect(() => {
    apiFetch<QuizResults>(path)
      .then(setResults)
      .catch((e: unknown) => setError(asApiError(e)));
  }, [path]);

  // Students may still be taking the quiz: the teacher can reload the numbers.
  async function refresh() {
    setRefreshing(true);
    try {
      setResults(await apiFetch<QuizResults>(path));
      setError(null);
    } catch (e) {
      setError(asApiError(e));
    }
    setRefreshing(false);
  }

  if (error && !results) {
    return (
      <Page quizId={quizId}>
        <Alert>
          {error.status === 404 || error.status === 400
            ? "هذا الاختبار غير موجود، أو أنه ليس من اختباراتك."
            : error.messages.join(" ")}
        </Alert>
      </Page>
    );
  }
  if (!results) {
    return (
      <Page quizId={quizId}>
        <p className="text-ink-muted" aria-busy="true">
          جارٍ تحميل النتائج…
        </p>
      </Page>
    );
  }

  const { quiz, summary, questions, students } = results;

  return (
    <Page quizId={quizId}>
      <header className="flex flex-col gap-3">
        <h1 dir="auto" className="text-2xl leading-9 font-semibold">
          {quiz.title}
        </h1>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
          <span>
            الصفوف: <bdi>{quiz.classes.map((c) => c.name).join("، ")}</bdi>
          </span>
          <span>المجموع {countLabel(quiz.maxScore, POINTS)}</span>
          <span>
            {quiz.negativeMarkPercent > 0 ? (
              <>
                العلامة السالبة <bdi>{quiz.negativeMarkPercent}%</bdi>
              </>
            ) : (
              "بلا علامة سالبة"
            )}
          </span>
        </p>
        <Button
          variant="secondary"
          className="self-start"
          onClick={refresh}
          disabled={refreshing}
        >
          {refreshing ? "جارٍ التحديث…" : "تحديث النتائج"}
        </Button>
        {error && <Alert>{error.messages.join(" ")}</Alert>}
      </header>

      <Section title="الملخّص">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="سلّموا" value={summary.submitted} />
          <Tile label="انتهى وقتهم" value={summary.expired} />
          <Tile label="يحلّون الآن" value={summary.inProgress} />
          <Tile label="لم يبدؤوا" value={summary.notStarted} />
        </dl>
        {summary.scored > 0 &&
        summary.average !== null &&
        summary.highest !== null &&
        summary.lowest !== null ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            <Fact label="المتوسط">
              <bdi>{formatPoints(summary.average)}</bdi> من{" "}
              <bdi>{formatPoints(quiz.maxScore)}</bdi>
            </Fact>
            <Fact label="الأعلى">
              <bdi>{formatPoints(summary.highest)}</bdi>
            </Fact>
            <Fact label="الأدنى">
              <bdi>{formatPoints(summary.lowest)}</bdi>
            </Fact>
          </dl>
        ) : (
          <p className="text-ink-muted">
            لا توجد علامات بعد: لم يُنهِ أحد الاختبار.
          </p>
        )}
      </Section>

      <Section title="الأسئلة">
        <p className="text-sm text-ink-muted">
          من إجابات الطلاب الذين أنهوا الاختبار فقط.
        </p>
        <ol className="flex flex-col divide-y divide-line">
          {questions.map((q) => (
            <li key={q.id} className="flex flex-col gap-2 py-3">
              <span className="flex items-baseline justify-between gap-3 text-sm text-ink-muted">
                <span className="font-medium text-ink">
                  السؤال {q.position}
                </span>
                <span>{countLabel(q.points, POINTS)}</span>
              </span>
              <span dir="auto" className="line-clamp-2 leading-7">
                {q.text}
              </span>
              <AnswerBar
                correct={q.correct}
                wrong={q.wrong}
                unanswered={q.unanswered}
              />
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="text-accent-strong">
                  صحيح <bdi>{q.correct}</bdi>
                </span>
                <span className="text-danger">
                  خطأ <bdi>{q.wrong}</bdi>
                </span>
                <span className="text-ink-muted">
                  بلا إجابة <bdi>{q.unanswered}</bdi>
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title={`الطلاب (${summary.students})`}>
        {students.length === 0 ? (
          <p className="text-ink-muted">لا يوجد طلاب في الصفوف المختارة.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {students.map((s) => (
              <li
                key={s.id}
                className="flex items-start justify-between gap-3 py-3"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span dir="auto" className="font-medium">
                    {s.fullName}
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-sm text-ink-muted">
                    <bdi>{s.username}</bdi>
                    {s.className && <bdi>{s.className}</bdi>}
                    {s.finishedAt && (
                      <span>{formatDateTime(s.finishedAt)}</span>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={STATUS_TONES[s.status]}>
                    {STATUS_LABELS[s.status]}
                  </Badge>
                  <StudentScore student={s} maxScore={quiz.maxScore} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}

function StudentScore({
  student,
  maxScore,
}: {
  student: QuizResults["students"][number];
  maxScore: number;
}) {
  if (student.score !== null) {
    return (
      <span className="font-semibold tabular-nums">
        <bdi>{formatPoints(student.score)}</bdi>
        <span className="font-normal text-ink-muted">
          {" "}
          من <bdi>{formatPoints(maxScore)}</bdi>
        </span>
      </span>
    );
  }
  if (student.status === "IN_PROGRESS") {
    return (
      <span className="text-sm text-ink-muted">
        أجاب عن <bdi>{student.answeredCount}</bdi>
      </span>
    );
  }
  return null;
}

// Share of right, wrong and blank answers for one question (the numbers are shown next to it).
function AnswerBar({
  correct,
  wrong,
  unanswered,
}: {
  correct: number;
  wrong: number;
  unanswered: number;
}) {
  const total = correct + wrong + unanswered;
  if (total === 0) return null;
  const width = (n: number) => `${(n / total) * 100}%`;
  return (
    <span
      aria-hidden
      className="flex h-2 overflow-hidden rounded-full bg-line/60"
    >
      <span className="bg-accent" style={{ width: width(correct) }} />
      <span className="bg-danger/70" style={{ width: width(wrong) }} />
    </span>
  );
}

function Page({ quizId, children }: { quizId: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <Link
        href={`/teacher/quizzes/${quizId}`}
        className="self-start rounded-lg py-2 text-sm font-medium text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-accent"
      >
        العودة إلى الاختبار
      </Link>
      {children}
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-paper px-3 py-2">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
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
