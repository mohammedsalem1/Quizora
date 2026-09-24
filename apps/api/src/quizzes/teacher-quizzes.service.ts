import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OptionDto, QuestionDto } from './dto/question.dto';
import { CreateQuizDto, UpdateQuizDto } from './dto/quiz-settings.dto';

type Db = Prisma.TransactionClient; // PrismaService or an interactive transaction

const MAX_QUESTIONS_PER_QUIZ = 100;

const LOCKED_MESSAGE =
  'Students have already started this quiz, so its questions, points, time limit and negative marking can no longer change';

const CLASS_SELECT = {
  select: { class: { select: { id: true, name: true } } },
};

const QUIZ_DETAIL_SELECT = {
  id: true,
  title: true,
  description: true,
  opensAt: true,
  closesAt: true,
  timeLimitMinutes: true,
  negativeMarkPercent: true,
  publishedAt: true,
  classes: CLASS_SELECT,
  questions: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      text: true,
      points: true,
      position: true,
      options: {
        orderBy: { position: 'asc' },
        select: { id: true, text: true, isCorrect: true, position: true },
      },
    },
  },
  _count: { select: { attempts: true } },
} satisfies Prisma.QuizSelect;

@Injectable()
export class TeacherQuizzesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(teacherId: string) {
    const quizzes = await this.prisma.quiz.findMany({
      where: { teacherId },
      orderBy: { opensAt: 'desc' },
      select: {
        id: true,
        title: true,
        opensAt: true,
        closesAt: true,
        timeLimitMinutes: true,
        negativeMarkPercent: true,
        publishedAt: true,
        classes: CLASS_SELECT,
        _count: { select: { questions: true, attempts: true } },
      },
    });
    return quizzes.map(({ classes, _count, ...quiz }) => ({
      ...quiz,
      classes: classes.map((c) => c.class),
      questionCount: _count.questions,
      attemptCount: _count.attempts,
    }));
  }

  get(teacherId: string, quizId: string) {
    return this.detail(this.prisma, teacherId, quizId);
  }

  async create(teacherId: string, dto: CreateQuizDto) {
    const opensAt = new Date(dto.opensAt);
    const closesAt = new Date(dto.closesAt);
    assertWindow(opensAt, closesAt);
    await assertClassesExist(this.prisma, dto.classIds);

    const quiz = await this.prisma.quiz.create({
      data: {
        title: dto.title,
        description: dto.description || null,
        teacherId, // always the caller; the body can't set an owner
        opensAt,
        closesAt,
        timeLimitMinutes: dto.timeLimitMinutes,
        negativeMarkPercent: dto.negativeMarkPercent ?? 0,
        classes: { create: dto.classIds.map((classId) => ({ classId })) },
      },
    });
    return this.detail(this.prisma, teacherId, quiz.id);
  }

  update(teacherId: string, quizId: string, dto: UpdateQuizDto) {
    return this.prisma.$transaction(async (tx) => {
      const quiz = await lockOwnedQuiz(tx, teacherId, quizId);

      if (quiz._count.attempts > 0) {
        const changesTimeLimit =
          dto.timeLimitMinutes !== undefined &&
          dto.timeLimitMinutes !== quiz.timeLimitMinutes;
        const changesMarking =
          dto.negativeMarkPercent !== undefined &&
          dto.negativeMarkPercent !== quiz.negativeMarkPercent;
        if (changesTimeLimit || changesMarking) {
          throw new ConflictException(LOCKED_MESSAGE);
        }
      }

      const opensAt = dto.opensAt ? new Date(dto.opensAt) : quiz.opensAt;
      const closesAt = dto.closesAt ? new Date(dto.closesAt) : quiz.closesAt;
      assertWindow(opensAt, closesAt);
      if (dto.classIds) await assertClassesExist(tx, dto.classIds);

      await tx.quiz.update({
        where: { id: quizId },
        data: {
          title: dto.title,
          description:
            dto.description === undefined ? undefined : dto.description || null,
          opensAt,
          closesAt,
          timeLimitMinutes: dto.timeLimitMinutes,
          negativeMarkPercent: dto.negativeMarkPercent,
          classes: dto.classIds
            ? {
                deleteMany: {},
                create: dto.classIds.map((classId) => ({ classId })),
              }
            : undefined,
        },
      });
      return this.detail(tx, teacherId, quizId);
    });
  }

  addQuestion(teacherId: string, quizId: string, dto: QuestionDto) {
    assertValidOptions(dto.options);
    return this.prisma.$transaction(async (tx) => {
      const quiz = await lockOwnedQuiz(tx, teacherId, quizId);
      assertNoAttempts(quiz._count.attempts);
      if (quiz._count.questions >= MAX_QUESTIONS_PER_QUIZ) {
        throw new ConflictException(
          `A quiz can have at most ${MAX_QUESTIONS_PER_QUIZ} questions`,
        );
      }

      const last = await tx.question.findFirst({
        where: { quizId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      await tx.question.create({
        data: {
          quizId,
          text: dto.text,
          points: dto.points,
          position: (last?.position ?? 0) + 1,
          options: { create: optionsData(dto.options) },
        },
      });
      return this.detail(tx, teacherId, quizId);
    });
  }

  replaceQuestion(
    teacherId: string,
    quizId: string,
    questionId: string,
    dto: QuestionDto,
  ) {
    assertValidOptions(dto.options);
    return this.prisma.$transaction(async (tx) => {
      const quiz = await lockOwnedQuiz(tx, teacherId, quizId);
      assertNoAttempts(quiz._count.attempts);
      await findQuestionInQuiz(tx, quizId, questionId);

      await tx.option.deleteMany({ where: { questionId } });
      await tx.question.update({
        where: { id: questionId },
        data: {
          text: dto.text,
          points: dto.points,
          options: { create: optionsData(dto.options) },
        },
      });
      return this.detail(tx, teacherId, quizId);
    });
  }

  removeQuestion(teacherId: string, quizId: string, questionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const quiz = await lockOwnedQuiz(tx, teacherId, quizId);
      assertNoAttempts(quiz._count.attempts);
      await findQuestionInQuiz(tx, quizId, questionId);
      if (quiz.publishedAt && quiz._count.questions === 1) {
        throw new ConflictException(
          'A published quiz must keep at least one question',
        );
      }

      await tx.question.delete({ where: { id: questionId } }); // options cascade
      return this.detail(tx, teacherId, quizId);
    });
  }

  publish(teacherId: string, quizId: string) {
    return this.prisma.$transaction(async (tx) => {
      const quiz = await lockOwnedQuiz(tx, teacherId, quizId);
      if (quiz.publishedAt) return this.detail(tx, teacherId, quizId);

      // Question saves already enforce these rules; they're re-checked here because
      // publishing is what makes the quiz visible to students.
      const problems: string[] = [];
      if (quiz.closesAt <= new Date()) {
        problems.push('The closing date has already passed');
      }
      if (quiz._count.classes === 0) {
        problems.push('Assign the quiz to at least one class');
      }
      const questions = await tx.question.findMany({
        where: { quizId },
        orderBy: { position: 'asc' },
        select: { options: { select: { isCorrect: true } } },
      });
      if (questions.length === 0) problems.push('Add at least one question');
      questions.forEach((q, i) => {
        const correct = q.options.filter((o) => o.isCorrect).length;
        if (q.options.length < 2 || correct !== 1) {
          problems.push(
            `Question ${i + 1} needs at least two options and exactly one correct answer`,
          );
        }
      });
      if (problems.length > 0) throw new ConflictException(problems);

      await tx.quiz.update({
        where: { id: quizId },
        data: { publishedAt: new Date() },
      });
      return this.detail(tx, teacherId, quizId);
    });
  }

  // The full quiz as its owner sees it, correct answers included. Another teacher's quiz
  // is a 404 rather than a 403, so its existence isn't revealed.
  private async detail(db: Db, teacherId: string, quizId: string) {
    const quiz = await db.quiz.findFirst({
      where: { id: quizId, teacherId },
      select: QUIZ_DETAIL_SELECT,
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    const { classes, _count, ...rest } = quiz;
    return {
      ...rest,
      classes: classes.map((c) => c.class),
      attemptCount: _count.attempts,
      isLocked: _count.attempts > 0,
    };
  }
}

// Locks the quiz row until the transaction ends, then loads it (only if the caller owns it).
// Starting an attempt inserts a QuizAttempt row referencing this quiz, and Postgres makes
// that insert wait for this lock (and vice versa). So "no attempts yet" can't become false
// halfway through an edit, and an edit can't slip in after the first student has started.
async function lockOwnedQuiz(tx: Db, teacherId: string, quizId: string) {
  await tx.$queryRaw`SELECT id FROM "Quiz" WHERE id = ${quizId} FOR UPDATE`;
  const quiz = await tx.quiz.findFirst({
    where: { id: quizId, teacherId },
    select: {
      opensAt: true,
      closesAt: true,
      timeLimitMinutes: true,
      negativeMarkPercent: true,
      publishedAt: true,
      _count: { select: { attempts: true, questions: true, classes: true } },
    },
  });
  if (!quiz) throw new NotFoundException('Quiz not found');
  return quiz;
}

async function findQuestionInQuiz(tx: Db, quizId: string, questionId: string) {
  const question = await tx.question.findFirst({
    where: { id: questionId, quizId },
    select: { id: true },
  });
  if (!question) throw new NotFoundException('Question not found');
}

function assertNoAttempts(attemptCount: number) {
  if (attemptCount > 0) throw new ConflictException(LOCKED_MESSAGE);
}

function assertWindow(opensAt: Date, closesAt: Date) {
  if (closesAt <= opensAt) {
    throw new BadRequestException('closesAt must be after opensAt');
  }
}

async function assertClassesExist(db: Db, classIds: string[]) {
  const found = await db.class.count({ where: { id: { in: classIds } } });
  if (found !== classIds.length) {
    throw new BadRequestException('One or more classes do not exist');
  }
}

function assertValidOptions(options: OptionDto[]) {
  const correct = options.filter((o) => o.isCorrect).length;
  if (correct !== 1) {
    throw new BadRequestException(
      'A question must have exactly one correct option',
    );
  }
  const texts = new Set(options.map((o) => o.text.toLowerCase()));
  if (texts.size !== options.length) {
    throw new BadRequestException('Options of a question must be different');
  }
}

function optionsData(options: OptionDto[]) {
  return options.map((o, i) => ({
    text: o.text,
    isCorrect: o.isCorrect,
    position: i + 1,
  }));
}
