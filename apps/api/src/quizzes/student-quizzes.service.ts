import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { Prisma } from '../generated/prisma/client';
import { expireOverdueAttempts } from '../attempts/expire-overdue';
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

// Only what a student needs before starting, and their own score once they've finished.
// Never questions, options or correct answers.
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
      select: { status: true, expiresAt: true, score: true, maxScore: true },
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

  // The student's own score, once they have finished (null for attempts that ended before
  // scoring existed).
  const finished = state === 'FINISHED' ? quiz.attempts.at(0) : undefined;
  const score = finished?.score ?? null;

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
    score: score === null ? null : score.toNumber(),
    maxScore: score === null ? null : (finished?.maxScore ?? null),
  };
}

@Injectable()
export class StudentQuizzesService {
  constructor(private readonly prisma: PrismaService) {}

  // One clock reading per request: a quiz shown as FINISHED has always been finalized (and
  // scored) by the expiry step just before.
  async list(student: AuthUser) {
    const now = new Date();
    await expireOverdueAttempts(this.prisma, { studentId: student.id }, now);
    const quizzes = await this.prisma.quiz.findMany({
      where: candidatesFor(student),
      orderBy: { opensAt: 'desc' },
      select: selectFor(student),
    });
    return quizzes
      .map((quiz) => toStudentView(quiz, student, now))
      .filter((view) => view !== null);
  }

  // A draft, another class's quiz and a nonexistent id all look the same: 404.
  async get(student: AuthUser, quizId: string) {
    const now = new Date();
    await expireOverdueAttempts(this.prisma, { studentId: student.id }, now);
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, ...candidatesFor(student) },
      select: selectFor(student),
    });
    const view = quiz ? toStudentView(quiz, student, now) : null;
    if (!view) throw new NotFoundException('Quiz not found');
    return view;
  }
}
