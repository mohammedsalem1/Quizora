"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AttemptQuestion } from "@/components/AttemptQuestion";
import { Countdown } from "@/components/Countdown";
import { Alert, Button, ErrorList } from "@/components/ui";
import {
  ApiError,
  apiFetch,
  errorMessagesOf,
  isRedirectingToLogin,
} from "@/lib/api";
import { countLabel, QUESTIONS } from "@/lib/arabic";
import type { AttemptView } from "@/lib/types";
import { useAnswerSync } from "@/lib/useAnswerSync";

type Loaded = { view: AttemptView; offsetMs: number };

export default function AttemptPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const router = useRouter();
  const attemptPath = `/student/quizzes/${quizId}/attempt`;
  const resultPath = `/student/quizzes/${quizId}/result`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);

  // offsetMs = the server's clock minus the phone's, measured from before the request was
  // sent. Network delay then makes the countdown show slightly less time than is left,
  // never more. The phone's own clock setting doesn't matter.
  const load = useCallback(async (): Promise<Loaded> => {
    const sentAt = Date.now();
    const view = await apiFetch<AttemptView>(attemptPath);
    return { view, offsetMs: Date.parse(view.now) - sentAt };
  }, [attemptPath]);

  useEffect(() => {
    load()
      .then((result) => {
        // Automatic moves replace this page in the history, so "back" never bounces here.
        if (result.view.status !== "IN_PROGRESS") router.replace(resultPath);
        else setLoaded(result);
      })
      .catch((e: unknown) =>
        setLoadError(
          e instanceof ApiError ? e : new ApiError(500, errorMessagesOf(e)),
        ),
      );
  }, [load, router, resultPath]);

  if (loadError) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
        <Alert>
          {loadError.status === 404 || loadError.status === 400
            ? "لم تبدأ هذا الاختبار بعد."
            : loadError.messages.join(" ")}
        </Alert>
        <Link
          href={`/student/quizzes/${quizId}`}
          className="self-start rounded-lg py-2 text-sm font-medium text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          العودة إلى صفحة الاختبار
        </Link>
      </main>
    );
  }
  if (!loaded) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-ink-muted" aria-busy="true">
          جارٍ تحميل الاختبار…
        </p>
      </main>
    );
  }

  return (
    <TakingQuiz
      initial={loaded.view}
      initialOffsetMs={loaded.offsetMs}
      reload={load}
      attemptPath={attemptPath}
      resultPath={resultPath}
    />
  );
}

type Phase = "answering" | "confirming" | "submitting" | "ending";

function TakingQuiz({
  initial,
  initialOffsetMs,
  reload,
  attemptPath,
  resultPath,
}: {
  initial: AttemptView;
  initialOffsetMs: number;
  reload: () => Promise<Loaded>;
  attemptPath: string;
  resultPath: string;
}) {
  const router = useRouter();
  const questions = initial.questions ?? [];
  const [offsetMs, setOffsetMs] = useState(initialOffsetMs);
  const [remainingMs, setRemainingMs] = useState(
    () => Date.parse(initial.expiresAt) - Date.parse(initial.now),
  );
  const [phase, setPhase] = useState<Phase>("answering");
  const [submitError, setSubmitError] = useState<string[] | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const goToResult = useCallback(
    () => router.replace(resultPath),
    [router, resultPath],
  );
  const {
    choiceOf,
    saveStateOf,
    errorOf,
    answeredCount,
    pending,
    choose,
    settled,
    mark,
    reconcile,
  } = useAnswerSync(attemptPath, initial.answers ?? [], goToResult);

  // Our estimate of the server's clock says time is up. Let saves already on their way
  // finish, then ask the server. If it says the attempt is still running (the estimate was
  // a little early), carry on with its fresh clock.
  const ending = useRef(false);
  const timeUp = useCallback(async () => {
    if (ending.current) return;
    ending.current = true;
    setPhase("ending");
    setAnnouncement("انتهى الوقت. نحفظ آخر إجاباتك…");
    await settled(5000);
    try {
      const fresh = await reload();
      if (fresh.view.status === "IN_PROGRESS") {
        setOffsetMs(fresh.offsetMs);
        setPhase("answering");
        ending.current = false;
        return;
      }
    } catch {
      // The result page reads the real status anyway.
    }
    goToResult();
  }, [settled, reload, goToResult]);

  // The countdown is recomputed from the clock every second rather than counted down, so
  // it stays right after the phone sleeps (timers pause while it does).
  const announced = useRef<number | null>(null);
  useEffect(() => {
    const expiresAt = Date.parse(initial.expiresAt);
    const tick = () => {
      const ms = expiresAt - (Date.now() + offsetMs);
      setRemainingMs(ms);
      const minutesLeft = Math.ceil(ms / 60_000);
      if (
        (minutesLeft === 5 || minutesLeft === 1) &&
        announced.current !== minutesLeft
      ) {
        announced.current = minutesLeft;
        setAnnouncement(
          minutesLeft === 5 ? "بقيت خمس دقائق." : "بقيت دقيقة واحدة.",
        );
      }
      if (ms <= 0) void timeUp();
    };
    const interval = window.setInterval(tick, 1000);

    // Back from sleep or another app: check with the server, in case the attempt ended or a
    // save's response was lost in the meantime.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      tick();
      const since = mark();
      reload()
        .then((fresh) => {
          if (fresh.view.status !== "IN_PROGRESS") goToResult();
          else {
            setOffsetMs(fresh.offsetMs);
            reconcile(fresh.view.answers ?? [], since);
          }
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [
    initial.expiresAt,
    offsetMs,
    timeUp,
    reload,
    mark,
    reconcile,
    goToResult,
  ]);

  // Warn before leaving while an answer is still on its way to the server.
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!isRedirectingToLogin()) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  async function submit() {
    setPhase("submitting");
    setSubmitError(null);
    // Never submit ahead of an answer that is still being saved.
    if (!(await settled(15_000))) {
      setSubmitError([
        "لم نتأكد بعد من حفظ كل إجاباتك. تحقّق من اتصالك ثم سلّم مرة أخرى.",
      ]);
      setPhase("answering");
      return;
    }
    try {
      // Submitting twice is harmless, so a retry after a lost response is safe.
      await apiFetch(`${attemptPath}/submit`, { method: "POST" });
      goToResult();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        goToResult(); // the time ran out first: the result page says so
        return;
      }
      setSubmitError(errorMessagesOf(e));
      setPhase("answering");
    }
  }

  const locked = phase === "submitting" || phase === "ending";
  const unanswered = questions.length - answeredCount;
  const { quiz } = initial;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-10">
      <div className="sticky top-0 z-10 -mx-4 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur-sm">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <Countdown remainingMs={remainingMs} />
          <span className="text-sm text-ink-muted">
            أجبت عن <bdi>{answeredCount}</bdi> من <bdi>{questions.length}</bdi>
          </span>
        </div>
      </div>
      <p className="sr-only" aria-live="assertive">
        {announcement}
      </p>

      <header className="flex flex-col gap-2 pt-2">
        <h1 dir="auto" className="text-2xl leading-9 font-semibold">
          {quiz.title}
        </h1>
        <p className="text-sm text-ink-muted">
          {quiz.negativeMarkPercent > 0 ? (
            <>
              الإجابة الخاطئة تُنقص <bdi>{quiz.negativeMarkPercent}%</bdi> من
              علامة سؤالها، والسؤال المتروك لا يُنقص شيئاً. إن لم تكن متأكداً
              يمكنك مسح إجابتك.
            </>
          ) : (
            "تُحفظ كل إجابة فور اختيارها، ويمكنك تغييرها قبل التسليم."
          )}
        </p>
      </header>

      {phase === "ending" && (
        <Alert tone="warning">انتهى الوقت. نحفظ آخر إجاباتك…</Alert>
      )}

      {questions.map((question, i) => (
        <AttemptQuestion
          key={question.id}
          question={question}
          number={i + 1}
          choice={choiceOf(question.id)}
          saveState={saveStateOf(question.id)}
          error={errorOf(question.id)}
          disabled={locked}
          onChoose={(optionId) => choose(question.id, optionId)}
        />
      ))}

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <ErrorList messages={submitError} />
        {phase === "confirming" || phase === "submitting" ? (
          <div className="flex flex-col gap-3">
            <p className="font-medium leading-7">
              أجبت عن <bdi>{answeredCount}</bdi> من{" "}
              <bdi>{questions.length}</bdi>.{" "}
              {unanswered > 0 &&
                `${countLabel(unanswered, QUESTIONS)} بلا إجابة. `}
              بعد التسليم لا يمكنك تغيير إجاباتك.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={submit}
                disabled={phase === "submitting" || pending}
              >
                {phase === "submitting" ? "جارٍ التسليم…" : "سلّم الآن"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPhase("answering")}
                disabled={phase === "submitting"}
              >
                تراجع
              </Button>
            </div>
          </div>
        ) : (
          <Button
            className="self-start"
            onClick={() => setPhase("confirming")}
            disabled={locked || pending}
          >
            {pending ? "جارٍ حفظ الإجابات…" : "سلّم الاختبار"}
          </Button>
        )}
      </section>
    </main>
  );
}
