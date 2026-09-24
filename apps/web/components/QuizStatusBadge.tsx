import { Badge } from "./ui";

type QuizDates = {
  publishedAt: string | null;
  opensAt: string;
  closesAt: string;
};

type Status = "draft" | "scheduled" | "open" | "closed";

// What students can currently see: nothing (draft), not yet (scheduled), now (open), or no longer.
export function quizStatus(quiz: QuizDates, now = new Date()): Status {
  if (!quiz.publishedAt) return "draft";
  if (now < new Date(quiz.opensAt)) return "scheduled";
  if (now < new Date(quiz.closesAt)) return "open";
  return "closed";
}

const LABELS: Record<Status, string> = {
  draft: "مسودة",
  scheduled: "مجدول",
  open: "مفتوح الآن",
  closed: "مغلق",
};

const TONES = {
  draft: "neutral",
  scheduled: "accent",
  open: "solid",
  closed: "muted",
} as const;

export function QuizStatusBadge({ quiz }: { quiz: QuizDates }) {
  const status = quizStatus(quiz);
  return <Badge tone={TONES[status]}>{LABELS[status]}</Badge>;
}
