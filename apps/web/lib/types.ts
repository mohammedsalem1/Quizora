// Shapes of the API's JSON responses (see apps/api/src).

export type Role = "STUDENT" | "TEACHER";

export type ClassRef = { id: string; name: string };

export type User = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  class: ClassRef | null;
};

export type Option = {
  id: string;
  text: string;
  isCorrect: boolean;
  position: number;
};

export type Question = {
  id: string;
  text: string;
  points: number;
  position: number;
  options: Option[];
};

type QuizBase = {
  id: string;
  title: string;
  opensAt: string;
  closesAt: string;
  timeLimitMinutes: number;
  negativeMarkPercent: number;
  publishedAt: string | null;
  classes: ClassRef[];
};

// GET /teacher/quizzes
export type QuizSummary = QuizBase & {
  questionCount: number;
  attemptCount: number;
};

// GET /teacher/quizzes/:id, and the response of every change to a quiz
export type QuizDetail = QuizBase & {
  description: string | null;
  questions: Question[];
  attemptCount: number;
  isLocked: boolean;
};
