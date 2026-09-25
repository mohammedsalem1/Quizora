"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { keyDate, StudentQuizStateBadge } from "@/components/StudentQuizState";
import { Alert, Button, buttonClass, ErrorList } from "@/components/ui";
import { ApiError, apiFetch, errorMessagesOf } from "@/lib/api";
import { countLabel, MINUTES, POINTS, QUESTIONS } from "@/lib/arabic";
import { formatDateTime } from "@/lib/dates";
import type { StudentQuiz } from "@/lib/types";

export default function StudentQuizPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const router = useRouter();
  const [quiz, setQuiz] = useState<StudentQuiz | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string[] | null>(null);

  useEffect(() => {
    apiFetch<StudentQuiz>(`/student/quizzes/${quizId}`)
      .then(setQuiz)
      .catch((e: unknown) =>
        setLoadError(
          e instanceof ApiError ? e : new ApiError(500, errorMessagesOf(e)),
        ),
      );
  }, [quizId]);

  if (loadError) {
    return (
      <Page>
        <Alert>
          {loadError.status === 404 || loadError.status === 400
            ? "هذا الاختبار غير موجود، أو أنه ليس لصفّك."
            : loadError.messages.join(" ")}
        </Alert>
      </Page>
    );
  }
  if (!quiz) {
    return (
      <Page>
        <p className="text-ink-muted" aria-busy="true">
          جارٍ تحميل الاختبار…
        </p>
      </Page>
    );
  }

  const attemptPath = `/student/quizzes/${quizId}/attempt`;

  async function start() {
    setStarting(true);
    setStartError(null);
    try {
      // Starting twice is safe: the server resumes the same attempt.
      await apiFetch(`/student/quizzes/${quizId}/attempt`, { method: "POST" });
      router.push(attemptPath);
    } catch (e) {
      setStartError(errorMessagesOf(e));
      setStarting(false);
      // The quiz may have closed, or been started on another device: show its real state.
      apiFetch<StudentQuiz>(`/student/quizzes/${quizId}`)
        .then(setQuiz)
        .catch(() => {});
    }
  }

  return (
    <Page>
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h1 dir="auto" className="text-2xl leading-9 font-semibold">
            {quiz.title}
          </h1>
          <StudentQuizStateBadge state={quiz.state} />
        </div>
        {quiz.description && (
          <p dir="auto" className="text-ink-muted">
            {quiz.description}
          </p>
        )}
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-xl border border-line bg-surface p-4">
        <Fact label="الأسئلة">{countLabel(quiz.questionCount, QUESTIONS)}</Fact>
        <Fact label="المجموع">{countLabel(quiz.totalPoints, POINTS)}</Fact>
        <Fact label="المدة">{countLabel(quiz.timeLimitMinutes, MINUTES)}</Fact>
        <Fact label="الموعد">{keyDate(quiz)}</Fact>
        <Fact label="العلامة السالبة">
          {quiz.negativeMarkPercent > 0 ? (
            <>
              كل إجابة خاطئة تُنقص <bdi>{quiz.negativeMarkPercent}%</bdi> من
              علامة سؤالها. السؤال المتروك لا يُنقص شيئاً.
            </>
          ) : (
            "لا تُنقص الإجابات الخاطئة شيئاً."
          )}
        </Fact>
      </dl>

      {quiz.state === "AVAILABLE" && (
        <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-lg font-semibold">قبل أن تبدأ</h2>
          <ul className="list-disc space-y-1 ps-5 leading-7">
            <li>لديك محاولة واحدة فقط.</li>
            <li>
              مدتك {countLabel(quiz.timeLimitMinutes, MINUTES)} من لحظة البدء،
              لكنها تنتهي عند إغلاق الاختبار ({formatDateTime(quiz.closesAt)})
              إن جاء قبل ذلك.
            </li>
            <li>
              يبدأ العدّ التنازلي عند البدء، ولا يتوقف إذا أغلقت الصفحة أو فقدت
              الاتصال.
            </li>
            <li>تُحفظ كل إجابة فور اختيارها، ويمكنك تغييرها قبل التسليم.</li>
          </ul>
          <ErrorList messages={startError} />
          {confirming ? (
            <div className="flex flex-col gap-3 rounded-lg bg-accent-soft p-4">
              <p className="font-medium">
                هل أنت مستعد؟ سيبدأ الوقت الآن ولا يمكن إيقافه.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={start} disabled={starting}>
                  {starting ? "جارٍ البدء…" : "ابدأ الآن"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setConfirming(false)}
                  disabled={starting}
                >
                  ليس الآن
                </Button>
              </div>
            </div>
          ) : (
            <Button className="self-start" onClick={() => setConfirming(true)}>
              ابدأ الاختبار
            </Button>
          )}
        </section>
      )}

      {quiz.state === "IN_PROGRESS" && (
        <Alert tone="info">
          <span className="flex flex-col items-start gap-3">
            بدأت هذا الاختبار ولم تُسلّمه بعد، والوقت ما زال يجري.
            <Link href={attemptPath} className={buttonClass("primary")}>
              أكمل الاختبار
            </Link>
          </span>
        </Alert>
      )}

      {quiz.state === "FINISHED" && (
        <Link
          href={`/student/quizzes/${quizId}/result`}
          className={`${buttonClass("primary")} self-start`}
        >
          عرض النتيجة
        </Link>
      )}

      {quiz.state === "NOT_OPEN_YET" && (
        <Alert tone="info">
          يُفتح هذا الاختبار {formatDateTime(quiz.opensAt)}. عُد عندها لتبدأه.
        </Alert>
      )}

      {quiz.state === "CLOSED" && (
        <Alert tone="warning">
          أُغلق هذا الاختبار {formatDateTime(quiz.closesAt)} ولم تبدأه.
        </Alert>
      )}
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <Link
        href="/student"
        className="self-start rounded-lg py-2 text-sm font-medium text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-accent"
      >
        العودة إلى اختباراتي
      </Link>
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
