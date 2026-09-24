"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { QuestionCard } from "@/components/QuestionCard";
import { QuestionForm, type QuestionPayload } from "@/components/QuestionForm";
import {
  QuizSettingsForm,
  type QuizSettingsPayload,
} from "@/components/QuizSettingsForm";
import { QuizStatusBadge } from "@/components/QuizStatusBadge";
import { Alert, Button, ErrorList } from "@/components/ui";
import { ApiError, apiFetch, errorMessagesOf } from "@/lib/api";
import { ATTEMPTS, countLabel, MINUTES, POINTS } from "@/lib/arabic";
import { formatDateTime } from "@/lib/dates";
import type { ClassRef, QuizDetail } from "@/lib/types";

type Mode = "view" | "settings" | "add" | { editing: string };

// Success or error messages are shown next to the part of the page they're about.
type Feedback = {
  area: "settings" | "questions" | "publish";
  tone: "info" | "error";
  messages: string[];
};

export default function QuizEditorPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [classes, setClasses] = useState<ClassRef[] | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<QuizDetail>(`/teacher/quizzes/${quizId}`),
      apiFetch<ClassRef[]>("/classes"),
    ])
      .then(([loadedQuiz, loadedClasses]) => {
        setQuiz(loadedQuiz);
        setClasses(loadedClasses);
      })
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
          {loadError.status === 404
            ? "هذا الاختبار غير موجود، أو أنه ليس من اختباراتك."
            : loadError.messages.join(" ")}
        </Alert>
      </Page>
    );
  }
  if (!quiz || !classes) {
    return (
      <Page>
        <p className="text-ink-muted" aria-busy="true">
          جارٍ تحميل الاختبار…
        </p>
      </Page>
    );
  }

  const path = `/teacher/quizzes/${quizId}`;
  const totalPoints = quiz.questions.reduce((sum, q) => sum + q.points, 0);
  const canEditQuestions = !quiz.isLocked && mode === "view";

  function open(next: Mode) {
    setFeedback(null);
    setMode(next);
  }

  // Every change returns the whole updated quiz, so the page simply replaces it.
  function applied(
    updated: QuizDetail,
    area: Feedback["area"],
    message: string,
  ) {
    setQuiz(updated);
    setMode("view");
    setFeedback({ area, tone: "info", messages: [message] });
  }

  async function saveSettings(payload: QuizSettingsPayload) {
    const updated = await apiFetch<QuizDetail>(path, {
      method: "PATCH",
      body: payload,
    });
    applied(updated, "settings", "تم حفظ الإعدادات.");
  }

  async function addQuestion(payload: QuestionPayload) {
    const updated = await apiFetch<QuizDetail>(`${path}/questions`, {
      method: "POST",
      body: payload,
    });
    applied(updated, "questions", "تمت إضافة السؤال.");
  }

  async function saveQuestion(questionId: string, payload: QuestionPayload) {
    const updated = await apiFetch<QuizDetail>(
      `${path}/questions/${questionId}`,
      { method: "PUT", body: payload },
    );
    applied(updated, "questions", "تم حفظ السؤال.");
  }

  async function runAction(
    area: Feedback["area"],
    request: () => Promise<QuizDetail>,
    successMessage: string,
  ) {
    setBusy(true);
    setFeedback(null);
    try {
      applied(await request(), area, successMessage);
    } catch (e) {
      setFeedback({ area, tone: "error", messages: errorMessagesOf(e) });
    }
    setBusy(false);
  }

  function deleteQuestion(questionId: string, number: number) {
    if (!window.confirm(`حذف السؤال ${number}؟ لا يمكن التراجع عن الحذف.`)) {
      return;
    }
    void runAction(
      "questions",
      () =>
        apiFetch<QuizDetail>(`${path}/questions/${questionId}`, {
          method: "DELETE",
        }),
      "تم حذف السؤال.",
    );
  }

  function publish() {
    void runAction(
      "publish",
      () => apiFetch<QuizDetail>(`${path}/publish`, { method: "POST" }),
      "تم نشر الاختبار. سيظهر لطلاب الصفوف المختارة عند موعد فتحه.",
    );
  }

  const feedbackFor = (area: Feedback["area"]) =>
    feedback?.area === area ? (
      feedback.tone === "error" ? (
        <ErrorList messages={feedback.messages} />
      ) : (
        <Alert tone="info">{feedback.messages[0]}</Alert>
      )
    ) : null;

  return (
    <Page>
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h1 dir="auto" className="text-2xl leading-9 font-semibold">
            {quiz.title}
          </h1>
          <QuizStatusBadge quiz={quiz} />
        </div>
        {quiz.description && (
          <p dir="auto" className="text-ink-muted">
            {quiz.description}
          </p>
        )}
      </header>

      {quiz.isLocked && (
        <Alert tone="warning">
          بدأ الطلاب هذا الاختبار ({countLabel(quiz.attemptCount, ATTEMPTS)})،
          لذلك لم يعد ممكناً تعديل الأسئلة أو العلامات أو المدة أو العلامة
          السالبة. ما زال بإمكانك تعديل العنوان والوصف والمواعيد والصفوف.
        </Alert>
      )}

      <Section
        title="الإعدادات"
        action={
          mode === "view" && (
            <Button variant="secondary" onClick={() => open("settings")}>
              تعديل الإعدادات
            </Button>
          )
        }
      >
        {feedbackFor("settings")}
        {mode === "settings" ? (
          <QuizSettingsForm
            classes={classes}
            initial={quiz}
            locked={quiz.isLocked}
            submitLabel="حفظ الإعدادات"
            onSubmit={saveSettings}
            onCancel={() => open("view")}
          />
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            <Fact label="يُفتح">{formatDateTime(quiz.opensAt)}</Fact>
            <Fact label="يُغلق">{formatDateTime(quiz.closesAt)}</Fact>
            <Fact label="المدة">
              {countLabel(quiz.timeLimitMinutes, MINUTES)}
            </Fact>
            <Fact label="العلامة السالبة">
              {quiz.negativeMarkPercent > 0 ? (
                <>
                  <bdi>{quiz.negativeMarkPercent}%</bdi> من علامة السؤال لكل
                  إجابة خاطئة
                </>
              ) : (
                "غير مفعّلة"
              )}
            </Fact>
            <Fact label="الصفوف">
              <bdi>{quiz.classes.map((c) => c.name).join("، ")}</bdi>
            </Fact>
            <Fact label="النشر">
              {quiz.publishedAt
                ? `نُشر ${formatDateTime(quiz.publishedAt)}`
                : "مسودة، لا يراها الطلاب بعد"}
            </Fact>
          </dl>
        )}
      </Section>

      <Section
        title="الأسئلة"
        subtitle={
          quiz.questions.length > 0
            ? `المجموع ${countLabel(totalPoints, POINTS)}`
            : undefined
        }
      >
        {feedbackFor("questions")}
        {quiz.questions.length === 0 && mode !== "add" && (
          <p className="text-ink-muted">
            لا أسئلة بعد. أضف أول سؤال، ثم انشر الاختبار عندما يكتمل.
          </p>
        )}
        {quiz.questions.length > 0 && (
          <div className="divide-y divide-line">
            {quiz.questions.map((question, i) =>
              typeof mode === "object" && mode.editing === question.id ? (
                <div key={question.id} className="py-4">
                  <QuestionForm
                    initial={question}
                    submitLabel="حفظ السؤال"
                    onSubmit={(payload) => saveQuestion(question.id, payload)}
                    onCancel={() => open("view")}
                  />
                </div>
              ) : (
                <QuestionCard
                  key={question.id}
                  number={i + 1}
                  question={question}
                  editable={canEditQuestions}
                  busy={busy}
                  onEdit={() => open({ editing: question.id })}
                  onDelete={() => deleteQuestion(question.id, i + 1)}
                />
              ),
            )}
          </div>
        )}
        {mode === "add" ? (
          <QuestionForm
            submitLabel="إضافة السؤال"
            onSubmit={addQuestion}
            onCancel={() => open("view")}
          />
        ) : (
          canEditQuestions && (
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => open("add")}
              disabled={busy}
            >
              إضافة سؤال
            </Button>
          )
        )}
      </Section>

      {!quiz.publishedAt && (
        <Section title="النشر">
          <p className="text-ink-muted">
            بعد النشر يرى طلاب الصفوف المختارة الاختبار عند موعد فتحه. يمكنك
            تعديل الأسئلة إلى أن يبدأه أول طالب.
          </p>
          {feedbackFor("publish")}
          <Button
            className="self-start"
            onClick={publish}
            disabled={busy || mode !== "view"}
          >
            نشر الاختبار
          </Button>
        </Section>
      )}
      {quiz.publishedAt && feedbackFor("publish")}
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <Link
        href="/teacher"
        className="self-start rounded-lg py-2 text-sm font-medium text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-accent"
      >
        العودة إلى اختباراتي
      </Link>
      {children}
    </main>
  );
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          {subtitle && (
            <span className="text-sm text-ink-muted">{subtitle}</span>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
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
