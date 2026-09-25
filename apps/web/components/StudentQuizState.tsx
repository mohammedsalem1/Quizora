import { formatDateTime } from "@/lib/dates";
import type { StudentQuiz, StudentQuizState } from "@/lib/types";
import { Badge } from "./ui";

const LABELS: Record<StudentQuizState, string> = {
  AVAILABLE: "متاح الآن",
  IN_PROGRESS: "لم تُسلّمه بعد",
  NOT_OPEN_YET: "لم يُفتح بعد",
  FINISHED: "انتهيت منه",
  CLOSED: "فاتك",
};

const TONES = {
  AVAILABLE: "solid",
  IN_PROGRESS: "accent",
  NOT_OPEN_YET: "neutral",
  FINISHED: "muted",
  CLOSED: "muted",
} as const;

export function StudentQuizStateBadge({ state }: { state: StudentQuizState }) {
  return <Badge tone={TONES[state]}>{LABELS[state]}</Badge>;
}

// The date that matters to the student right now. The tense follows the server's state,
// not the phone's clock (which may be off).
export function keyDate(quiz: StudentQuiz, now = new Date()): string {
  if (quiz.state === "NOT_OPEN_YET") {
    return `يُفتح ${formatDateTime(quiz.opensAt)}`;
  }
  const closed =
    quiz.state === "CLOSED" ||
    (quiz.state === "FINISHED" && now >= new Date(quiz.closesAt));
  return `${closed ? "أُغلق" : "يُغلق"} ${formatDateTime(quiz.closesAt)}`;
}
