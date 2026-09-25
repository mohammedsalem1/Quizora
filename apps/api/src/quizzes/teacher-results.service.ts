import { Injectable, NotFoundException } from '@nestjs/common';
import { effectiveStatus } from '../attempts/attempt-rules';
import { expireOverdueAttempts } from '../attempts/expire-overdue';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { summarizeScores, tallyQuestions } from './quiz-results';

const STUDENT_SELECT = {
  id: true,
  fullName: true,
  username: true,
  class: { select: { name: true } },
} satisfies Prisma.UserSelect;

const RESULTS_SELECT = {
  id: true,
  title: true,
  opensAt: true,
  closesAt: true,
  timeLimitMinutes: true,
  negativeMarkPercent: true,
  publishedAt: true,
  classes: {
    select: {
      class: {
        select: { id: true, name: true, students: { select: STUDENT_SELECT } },
      },
    },
  },
  questions: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      text: true,
      points: true,
      position: true,
      options: { where: { isCorrect: true }, select: { id: true } },
    },
  },
  attempts: {
    select: {
      status: true,
      score: true,
      startedAt: true,
      expiresAt: true,
      submittedAt: true,
      student: { select: STUDENT_SELECT },
      answers: { select: { questionId: true, optionId: true } },
    },
  },
} satisfies Prisma.QuizSelect;

type Student = Prisma.UserGetPayload<{ select: typeof STUDENT_SELECT }>;

@Injectable()
export class TeacherResultsService {
  constructor(private readonly prisma: PrismaService) {}

  // Results of one of the teacher's own quizzes: every student it's for, how far each got,
  // their score, and basic statistics. Another teacher's quiz is a 404, as elsewhere.
  async results(teacherId: string, quizId: string) {
    const owned = await this.prisma.quiz.findFirst({
      where: { id: quizId, teacherId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Quiz not found');

    // A student who never came back still has a running attempt past its deadline: end and
    // score it now, so the results are complete.
    const now = new Date();
    await expireOverdueAttempts(this.prisma, { quizId }, now);

    const quiz = await this.prisma.quiz.findUniqueOrThrow({
      where: { id: quizId },
      select: RESULTS_SELECT,
    });

    // Everyone in the assigned classes, plus anyone who started before the teacher removed
    // their class (their attempt still counts).
    const students = new Map<string, Student>();
    for (const { class: c } of quiz.classes) {
      for (const student of c.students) students.set(student.id, student);
    }
    for (const attempt of quiz.attempts) {
      students.set(attempt.student.id, attempt.student);
    }
    const attemptOf = new Map(quiz.attempts.map((a) => [a.student.id, a]));

    const rows = [...students.values()]
      .map((student) => {
        const attempt = attemptOf.get(student.id);
        const status = attempt ? effectiveStatus(attempt, now) : 'NOT_STARTED';
        return {
          id: student.id,
          fullName: student.fullName,
          username: student.username,
          className: student.class?.name ?? null,
          status,
          score:
            attempt && attempt.score !== null ? attempt.score.toNumber() : null,
          answeredCount: attempt?.answers.length ?? 0,
          startedAt: attempt?.startedAt ?? null,
          finishedAt:
            status === 'SUBMITTED'
              ? (attempt?.submittedAt ?? null)
              : status === 'EXPIRED'
                ? (attempt?.expiresAt ?? null)
                : null,
        };
      })
      .sort(
        (a, b) =>
          (a.className ?? '').localeCompare(b.className ?? '') ||
          a.fullName.localeCompare(b.fullName, 'ar'),
      );

    const finished = quiz.attempts.filter((a) => a.status !== 'IN_PROGRESS');
    const count = (status: string) =>
      rows.filter((r) => r.status === status).length;
    const tallies = tallyQuestions(
      quiz.questions.map((q) => ({
        id: q.id,
        correctOptionId: q.options.at(0)?.id ?? null,
      })),
      finished,
    );

    return {
      quiz: {
        id: quiz.id,
        title: quiz.title,
        opensAt: quiz.opensAt,
        closesAt: quiz.closesAt,
        timeLimitMinutes: quiz.timeLimitMinutes,
        negativeMarkPercent: quiz.negativeMarkPercent,
        publishedAt: quiz.publishedAt,
        classes: quiz.classes.map(({ class: c }) => ({
          id: c.id,
          name: c.name,
        })),
        questionCount: quiz.questions.length,
        maxScore: quiz.questions.reduce((sum, q) => sum + q.points, 0),
      },
      summary: {
        students: rows.length,
        notStarted: count('NOT_STARTED'),
        inProgress: count('IN_PROGRESS'),
        submitted: count('SUBMITTED'),
        expired: count('EXPIRED'),
        ...summarizeScores(
          finished.flatMap((a) =>
            a.score !== null ? [a.score.mul(100).toNumber()] : [],
          ),
        ),
      },
      questions: quiz.questions.map((q, i) => ({
        id: q.id,
        position: q.position,
        text: q.text,
        points: q.points,
        correct: tallies[i].correct,
        wrong: tallies[i].wrong,
        unanswered: tallies[i].unanswered,
      })),
      students: rows,
    };
  }
}
