import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { quizAvailability } from '../quizzes/availability';
import { attemptDeadline, effectiveStatus } from './attempt-rules';

type Db = Prisma.TransactionClient; // PrismaService or an interactive transaction

// What a student sees of their attempt. Options never carry isCorrect.
const ATTEMPT_SELECT = {
  id: true,
  status: true,
  startedAt: true,
  expiresAt: true,
  submittedAt: true,
  quiz: {
    select: {
      id: true,
      title: true,
      timeLimitMinutes: true,
      negativeMarkPercent: true,
      questions: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          text: true,
          points: true,
          position: true,
          options: {
            orderBy: { position: 'asc' },
            select: { id: true, text: true, position: true },
          },
        },
      },
    },
  },
  answers: { select: { questionId: true, optionId: true } },
} satisfies Prisma.QuizAttemptSelect;

type AttemptRow = Prisma.QuizAttemptGetPayload<{
  select: typeof ATTEMPT_SELECT;
}>;

// Questions and saved answers are only included while the attempt is running. The score
// stays null until scoring exists (Phase 9).
function toView(attempt: AttemptRow, now: Date) {
  const status = effectiveStatus(attempt, now);
  const { questions } = attempt.quiz;
  const view = {
    id: attempt.id,
    status,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    submittedAt: attempt.submittedAt,
    now, // the server's clock, so the page's countdown doesn't depend on the phone's
    quiz: {
      id: attempt.quiz.id,
      title: attempt.quiz.title,
      timeLimitMinutes: attempt.quiz.timeLimitMinutes,
      negativeMarkPercent: attempt.quiz.negativeMarkPercent,
      questionCount: questions.length,
      totalPoints: questions.reduce((sum, q) => sum + q.points, 0),
    },
    answeredCount: attempt.answers.length,
    score: null,
  };
  if (status !== 'IN_PROGRESS') return view;
  return { ...view, questions, answers: attempt.answers };
}

@Injectable()
export class StudentAttemptsService {
  constructor(private readonly prisma: PrismaService) {}

  // Starts the student's one attempt, or resumes it if it's still running.
  async start(student: AuthUser, quizId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Shared lock on the quiz row, taken before anything is read: a teacher's edit
        // (FOR UPDATE) can't commit between these reads and the insert, while students
        // starting at the same moment don't wait for each other.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Quiz" WHERE id = ${quizId} FOR SHARE`;
        if (locked.length === 0) throw new NotFoundException('Quiz not found');
        const now = new Date();

        const quiz = await tx.quiz.findUniqueOrThrow({
          where: { id: quizId },
          select: {
            publishedAt: true,
            opensAt: true,
            closesAt: true,
            timeLimitMinutes: true,
            classes: { select: { classId: true } },
            attempts: {
              where: { studentId: student.id },
              select: { id: true, status: true, expiresAt: true },
            },
          },
        });
        const attempt = quiz.attempts.at(0) ?? null; // at most one: unique (quizId, studentId)

        const state = quizAvailability(
          {
            publishedAt: quiz.publishedAt,
            opensAt: quiz.opensAt,
            closesAt: quiz.closesAt,
            classIds: quiz.classes.map((c) => c.classId),
          },
          student.classId,
          attempt,
          now,
        );
        if (state === null) throw new NotFoundException('Quiz not found');
        if (state === 'NOT_OPEN_YET') {
          throw new ConflictException('This quiz is not open yet');
        }
        if (state === 'CLOSED') {
          throw new ConflictException('This quiz is closed');
        }
        if (state === 'FINISHED') {
          throw new ConflictException('You have already taken this quiz');
        }
        // The only state left with an attempt is IN_PROGRESS: resume it.
        if (attempt) return loadView(tx, attempt.id, now);

        // AVAILABLE. The deadline is fixed now and never recalculated.
        const created = await tx.quizAttempt.create({
          data: {
            quizId,
            studentId: student.id,
            startedAt: now,
            expiresAt: attemptDeadline(
              now,
              quiz.timeLimitMinutes,
              quiz.closesAt,
            ),
          },
          select: { id: true },
        });
        return loadView(tx, created.id, now);
      });
    } catch (error) {
      // The same student started twice at once: both saw no attempt, and the unique index
      // let only one insert through (the other waited for it to commit). Resume that one.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.get(student, quizId);
      }
      throw error;
    }
  }

  async get(student: AuthUser, quizId: string) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { quizId_studentId: { quizId, studentId: student.id } },
      select: ATTEMPT_SELECT,
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    return toView(attempt, new Date());
  }

  saveAnswer(
    student: AuthUser,
    quizId: string,
    questionId: string,
    optionId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const attemptId = await lockRunningAttempt(tx, student.id, quizId);
      await findQuestionInQuiz(tx, quizId, questionId);
      const option = await tx.option.findFirst({
        where: { id: optionId, questionId },
        select: { id: true },
      });
      if (!option) {
        throw new BadRequestException(
          'This option does not belong to the question',
        );
      }

      await tx.answer.upsert({
        where: { attemptId_questionId: { attemptId, questionId } },
        create: { attemptId, questionId, optionId },
        update: { optionId },
      });
      return { questionId, optionId };
    });
  }

  clearAnswer(student: AuthUser, quizId: string, questionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const attemptId = await lockRunningAttempt(tx, student.id, quizId);
      await findQuestionInQuiz(tx, quizId, questionId);
      await tx.answer.deleteMany({ where: { attemptId, questionId } });
    });
  }

  // Submitting twice is harmless (a double tap, or a retry after a lost response).
  submit(student: AuthUser, quizId: string) {
    return this.prisma.$transaction(async (tx) => {
      const attemptId = await lockAttempt(tx, student.id, quizId);
      const now = new Date();
      const attempt = await tx.quizAttempt.findUniqueOrThrow({
        where: { id: attemptId },
        select: { status: true, expiresAt: true },
      });
      const status = effectiveStatus(attempt, now);
      if (status === 'EXPIRED') throw new ConflictException(TIME_IS_UP);
      if (status === 'IN_PROGRESS') {
        await tx.quizAttempt.update({
          where: { id: attemptId },
          data: { status: 'SUBMITTED', submittedAt: now },
        });
      }
      return loadView(tx, attemptId, now);
    });
  }
}

const TIME_IS_UP = 'Time is up for this attempt';

async function loadView(db: Db, attemptId: string, now: Date) {
  const attempt = await db.quizAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: ATTEMPT_SELECT,
  });
  return toView(attempt, now);
}

// Locks this student's attempt row for the rest of the transaction, so answer saves and the
// submission happen one at a time: nothing can be saved after the attempt is submitted.
async function lockAttempt(tx: Db, studentId: string, quizId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "QuizAttempt"
    WHERE "quizId" = ${quizId} AND "studentId" = ${studentId}
    FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundException('Attempt not found');
  return rows[0].id;
}

// The same lock, and the attempt must still be running (checked with the server's clock).
async function lockRunningAttempt(tx: Db, studentId: string, quizId: string) {
  const attemptId = await lockAttempt(tx, studentId, quizId);
  const attempt = await tx.quizAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: { status: true, expiresAt: true },
  });
  const status = effectiveStatus(attempt, new Date());
  if (status === 'SUBMITTED') {
    throw new ConflictException('This attempt has already been submitted');
  }
  if (status === 'EXPIRED') throw new ConflictException(TIME_IS_UP);
  return attemptId;
}

async function findQuestionInQuiz(tx: Db, quizId: string, questionId: string) {
  const question = await tx.question.findFirst({
    where: { id: questionId, quizId },
    select: { id: true },
  });
  if (!question) throw new NotFoundException('Question not found');
}
