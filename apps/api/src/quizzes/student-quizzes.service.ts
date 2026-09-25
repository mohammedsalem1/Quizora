import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { quizAvailability } from './availability';

// Quizzes this student might see: published, and either assigned to their class or already
// started by them. quizAvailability() makes the final decision for each one.
function candidatesFor(student: AuthUser): Prisma.QuizWhereInput {
  const reasons: Prisma.QuizWhereInput[] = [
    { attempts: { some: { studentId: student.id } } },
  ];
  if (student.classId) {
    reasons.push({ classes: { some: { classId: student.classId } } });
  }
  return { publishedAt: { not: null }, OR: reasons };
}

// Only what a student needs before starting. Never questions, options or correct answers.
function selectFor(student: AuthUser) {
  return {
    id: true,
    title: true,
    description: true,
    opensAt: true,
    closesAt: true,
    timeLimitMinutes: true,
    negativeMarkPercent: true,
    publishedAt: true,
    classes: { select: { classId: true } },
    questions: { select: { points: true } },
    attempts: {
      where: { studentId: student.id }, // this student's attempt only
      select: { status: true, expiresAt: true },
    },
  } satisfies Prisma.QuizSelect;
}

type CandidateQuiz = Prisma.QuizGetPayload<{
  select: ReturnType<typeof selectFor>;
}>;

function toStudentView(quiz: CandidateQuiz, student: AuthUser, now: Date) {
  const state = quizAvailability(
    {
      publishedAt: quiz.publishedAt,
      opensAt: quiz.opensAt,
      closesAt: quiz.closesAt,
      classIds: quiz.classes.map((c) => c.classId),
    },
    student.classId,
    quiz.attempts[0] ?? null, // at most one: unique (quizId, studentId)
    now,
  );
  if (!state) return null;

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    opensAt: quiz.opensAt,
    closesAt: quiz.closesAt,
    timeLimitMinutes: quiz.timeLimitMinutes,
    negativeMarkPercent: quiz.negativeMarkPercent,
    questionCount: quiz.questions.length,
    totalPoints: quiz.questions.reduce((sum, q) => sum + q.points, 0),
    state,
  };
}

@Injectable()
export class StudentQuizzesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(student: AuthUser) {
    const quizzes = await this.prisma.quiz.findMany({
      where: candidatesFor(student),
      orderBy: { opensAt: 'desc' },
      select: selectFor(student),
    });
    const now = new Date();
    return quizzes
      .map((quiz) => toStudentView(quiz, student, now))
      .filter((view) => view !== null);
  }

  // A draft, another class's quiz and a nonexistent id all look the same: 404.
  async get(student: AuthUser, quizId: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, ...candidatesFor(student) },
      select: selectFor(student),
    });
    const view = quiz ? toStudentView(quiz, student, new Date()) : null;
    if (!view) throw new NotFoundException('Quiz not found');
    return view;
  }
}
