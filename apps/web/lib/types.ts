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

// --- Student side ---

export type StudentQuizState =
  "NOT_OPEN_YET" | "AVAILABLE" | "IN_PROGRESS" | "FINISHED" | "CLOSED";

// GET /student/quizzes and /student/quizzes/:id. Never includes questions or answers.
export type StudentQuiz = {
  id: string;
  title: string;
  description: string | null;
  opensAt: string;
  closesAt: string;
  timeLimitMinutes: number;
  negativeMarkPercent: number;
  questionCount: number;
  totalPoints: number;
  state: StudentQuizState;
};

export type AttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";

export type AttemptQuestion = {
  id: string;
  text: string;
  points: number;
  position: number;
  options: { id: string; text: string; position: number }[]; // no correct answer, ever
};

export type SavedAnswer = { questionId: string; optionId: string };

// /student/quizzes/:id/attempt (start, get, submit). `status` is the effective one: an attempt
// whose time is up is EXPIRED. Questions and answers only come while it's IN_PROGRESS.
export type AttemptView = {
  id: string;
  status: AttemptStatus;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  now: string; // the server's clock when it answered
  quiz: {
    id: string;
    title: string;
    timeLimitMinutes: number;
    negativeMarkPercent: number;
    questionCount: number;
    totalPoints: number;
  };
  answeredCount: number;
  score: number | null; // null until scoring exists (Phase 9)
  questions?: AttemptQuestion[];
  answers?: SavedAnswer[];
};
