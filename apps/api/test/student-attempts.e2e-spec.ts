import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import type { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers';

type AttemptView = {
  id: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  now: string;
  quiz: {
    id: string;
    title: string;
    timeLimitMinutes: number;
    negativeMarkPercent: number;
    questionCount: number;
    totalPoints: number;
  };
  answeredCount: number;
  score: number | null;
  maxScore: number | null;
  questions?: {
    id: string;
    text: string;
    points: number;
    position: number;
    options: { id: string; text: string; position: number }[];
  }[];
  answers?: { questionId: string; optionId: string }[];
};

type TestQuiz = {
  id: string;
  questions: { id: string; optionIds: string[] }[];
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR_MS);
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('Student attempts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let class10A: string;
  let class10B: string;
  let teacherId: string;
  let tokens: Record<'teacher' | 'a1' | 'a2' | 'b1', string>;
  let studentIds: Record<'a1' | 'a2' | 'b1', string>;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const jwt = app.get(JwtService);

    class10A = (await prisma.class.create({ data: { name: '10A' } })).id;
    class10B = (await prisma.class.create({ data: { name: '10B' } })).id;
    const user = (username: string, classId: string | null) =>
      prisma.user.create({
        data: {
          username,
          fullName: username,
          passwordHash: 'not-used',
          role: classId ? 'STUDENT' : 'TEACHER',
          classId,
        },
      });
    const teacher = await user('teacher1', null);
    const a1 = await user('student.a1', class10A);
    const a2 = await user('student.a2', class10A);
    const b1 = await user('student.b1', class10B);
    teacherId = teacher.id;
    studentIds = { a1: a1.id, a2: a2.id, b1: b1.id };
    tokens = {
      teacher: jwt.sign({ sub: teacher.id }),
      a1: jwt.sign({ sub: a1.id }),
      a2: jwt.sign({ sub: a2.id }),
      b1: jwt.sign({ sub: b1.id }),
    };
  });

  afterAll(async () => {
    await app.close();
  });

  // Two questions (2 + 3 points), each with a correct option first and a wrong one second.
  async function createQuiz(
    options: {
      classIds?: string[];
      opensAt?: Date;
      closesAt?: Date;
      timeLimitMinutes?: number;
      negativeMarkPercent?: number;
      correctListedSecond?: boolean;
      published?: boolean;
    } = {},
  ): Promise<TestQuiz> {
    const quiz = await prisma.quiz.create({
      data: {
        title: 'اختبار',
        teacherId,
        opensAt: options.opensAt ?? hoursFromNow(-1),
        closesAt: options.closesAt ?? hoursFromNow(24),
        timeLimitMinutes: options.timeLimitMinutes ?? 20,
        negativeMarkPercent: options.negativeMarkPercent ?? 25,
        publishedAt: options.published === false ? null : hoursFromNow(-48),
        classes: {
          create: (options.classIds ?? [class10A]).map((classId) => ({
            classId,
          })),
        },
        questions: {
          create: [2, 3].map((points, i) => ({
            text: `سؤال ${i + 1}`,
            points,
            position: i + 1,
            options: {
              // Correct first by default. correctListedSecond puts it second both in position
              // and in insertion order, so "the first option" can never pass for "the correct one".
              create: options.correctListedSecond
                ? [
                    { text: `خطأ ${i + 1}`, isCorrect: false, position: 1 },
                    { text: `صحيح ${i + 1}`, isCorrect: true, position: 2 },
                  ]
                : [
                    { text: `صحيح ${i + 1}`, isCorrect: true, position: 1 },
                    { text: `خطأ ${i + 1}`, isCorrect: false, position: 2 },
                  ],
            },
          })),
        },
      },
      select: {
        id: true,
        questions: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            options: { orderBy: { position: 'asc' }, select: { id: true } },
          },
        },
      },
    });
    return {
      id: quiz.id,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        optionIds: q.options.map((o) => o.id),
      })),
    };
  }

  const server = () => request(app.getHttpServer());
  const base = (quizId: string) => `/student/quizzes/${quizId}/attempt`;

  const start = (quizId: string, token: string) =>
    server().post(base(quizId)).set('Authorization', `Bearer ${token}`);
  const getAttempt = (quizId: string, token: string) =>
    server().get(base(quizId)).set('Authorization', `Bearer ${token}`);
  const answer = (
    quizId: string,
    questionId: string,
    body: object,
    token: string,
  ) =>
    server()
      .put(`${base(quizId)}/answers/${questionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const clear = (quizId: string, questionId: string, token: string) =>
    server()
      .delete(`${base(quizId)}/answers/${questionId}`)
      .set('Authorization', `Bearer ${token}`);
  const submit = (quizId: string, token: string) =>
    server()
      .post(`${base(quizId)}/submit`)
      .set('Authorization', `Bearer ${token}`);

  async function startOk(quizId: string, token = tokens.a1) {
    const res = await start(quizId, token).expect(200);
    return res.body as AttemptView;
  }

  // Locks the quiz row the way a teacher's edit does (SELECT … FOR UPDATE) and keeps it locked
  // until release() is called. `edit` then runs inside that same transaction.
  function holdQuizLikeATeacherEdit(
    quizId: string,
    edit: (tx: Prisma.TransactionClient) => Promise<unknown> = async () => {},
  ) {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const done = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Quiz" WHERE id = ${quizId} FOR UPDATE`;
        await released;
        await edit(tx);
      },
      { timeout: 20_000 },
    );
    return { release, done };
  }

  // Waits until `count` database sessions are blocked waiting for a lock.
  async function waitForLockWaiters(count: number) {
    for (let i = 0; i < 100; i++) {
      const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
        SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      if (waiting >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Expected ${count} sessions waiting for a lock`);
  }

  // Moves an attempt into the past so that its deadline was a minute ago, as if the student
  // had started earlier. Start, deadline and submission time move together, so the row stays
  // consistent (the database checks it).
  async function runOutOfTime(quizId: string, studentId: string) {
    const attempt = await prisma.quizAttempt.findUniqueOrThrow({
      where: { quizId_studentId: { quizId, studentId } },
    });
    const shift = attempt.expiresAt.getTime() - Date.now() + MINUTE_MS;
    const earlier = (date: Date) => new Date(date.getTime() - shift);
    await prisma.quizAttempt.update({
      where: { id: attempt.id },
      data: {
        startedAt: earlier(attempt.startedAt),
        expiresAt: earlier(attempt.expiresAt),
        submittedAt: attempt.submittedAt && earlier(attempt.submittedAt),
      },
    });
  }

  // Locks an attempt's row until release() is called, so requests queue behind it in the
  // order they arrive (the same lock answer saves and the submit take). `edit` runs inside
  // that transaction after release(), before it commits.
  function holdAttemptRow(
    quizId: string,
    studentId: string,
    edit: (tx: Prisma.TransactionClient) => Promise<unknown> = async () => {},
  ) {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const done = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM "QuizAttempt"
          WHERE "quizId" = ${quizId} AND "studentId" = ${studentId}
          FOR UPDATE`;
        await released;
        await edit(tx);
      },
      { timeout: 20_000 },
    );
    return { release, done };
  }

  const rowOf = (quizId: string, studentId: string) =>
    prisma.quizAttempt.findUniqueOrThrow({
      where: { quizId_studentId: { quizId, studentId } },
      include: { answers: true },
    });

  describe('access', () => {
    it('requires a login', async () => {
      const quiz = await createQuiz();
      await server().post(base(quiz.id)).expect(401);
      await server().get(base(quiz.id)).expect(401);
    });

    it('refuses teachers on every attempt route', async () => {
      const quiz = await createQuiz();
      const q = quiz.questions[0];
      const t = tokens.teacher;
      await start(quiz.id, t).expect(403);
      await getAttempt(quiz.id, t).expect(403);
      await answer(quiz.id, q.id, { optionId: q.optionIds[0] }, t).expect(403);
      await clear(quiz.id, q.id, t).expect(403);
      await submit(quiz.id, t).expect(403);
      expect(
        await prisma.quizAttempt.count({ where: { quizId: quiz.id } }),
      ).toBe(0);
    });

    it('rejects malformed ids and answer bodies', async () => {
      const quiz = await createQuiz();
      await startOk(quiz.id);
      const q = quiz.questions[0];
      await start('not-a-uuid', tokens.a1).expect(400);
      await answer(
        quiz.id,
        'not-a-uuid',
        { optionId: q.optionIds[0] },
        tokens.a1,
      ).expect(400);
      await answer(quiz.id, q.id, {}, tokens.a1).expect(400);
      await answer(quiz.id, q.id, { optionId: 'x' }, tokens.a1).expect(400);
      await answer(
        quiz.id,
        q.id,
        { optionId: q.optionIds[0], isCorrect: true },
        tokens.a1,
      ).expect(400);
    });
  });

  describe('starting', () => {
    it('starts an open quiz: deadline = start + time limit, questions without answers', async () => {
      const quiz = await createQuiz({ timeLimitMinutes: 20 });
      const res = await start(quiz.id, tokens.a1).expect(200);
      const view = res.body as AttemptView;

      expect(view.status).toBe('IN_PROGRESS');
      expect(
        new Date(view.expiresAt).getTime() - new Date(view.startedAt).getTime(),
      ).toBe(20 * MINUTE_MS);
      expect(Math.abs(new Date(view.now).getTime() - Date.now())).toBeLessThan(
        MINUTE_MS,
      );
      expect(view.quiz).toEqual({
        id: quiz.id,
        title: 'اختبار',
        timeLimitMinutes: 20,
        negativeMarkPercent: 25,
        questionCount: 2,
        totalPoints: 5,
      });
      expect(view.answeredCount).toBe(0);
      expect(view.answers).toEqual([]);
      expect(view.score).toBeNull();
      expect(view.questions?.map((q) => q.id)).toEqual(
        quiz.questions.map((q) => q.id),
      );
      expect(view.questions?.[0].options.map((o) => o.id)).toEqual(
        quiz.questions[0].optionIds,
      );
      expect(res.text).not.toContain('isCorrect');
      expect(res.text).not.toContain('pointsAwarded');

      const row = await prisma.quizAttempt.findUniqueOrThrow({
        where: { id: view.id },
      });
      expect(row.studentId).toBe(studentIds.a1);
      expect(row.status).toBe('IN_PROGRESS');
      expect(row.expiresAt.toISOString()).toBe(view.expiresAt);
    });

    it('cuts the deadline short at the closing time', async () => {
      const closesAt = new Date(Date.now() + 5 * MINUTE_MS);
      const quiz = await createQuiz({ closesAt, timeLimitMinutes: 20 });
      const view = await startOk(quiz.id);
      expect(view.expiresAt).toBe(closesAt.toISOString());
    });

    it('resumes the same attempt when started again, with the same deadline', async () => {
      const quiz = await createQuiz();
      const first = await startOk(quiz.id);
      const again = await startOk(quiz.id);
      expect(again.id).toBe(first.id);
      expect(again.expiresAt).toBe(first.expiresAt);
      expect(
        await prisma.quizAttempt.count({ where: { quizId: quiz.id } }),
      ).toBe(1);
    });

    it('creates only one attempt when the same student starts twice at once', async () => {
      const quiz = await createQuiz();
      // Both starts queue behind a held lock, then run side by side: both see no attempt,
      // and the unique index lets only one insert through. The other must resume it.
      const hold = holdQuizLikeATeacherEdit(quiz.id);
      const both = Promise.all([
        start(quiz.id, tokens.a1).then((res) => res),
        start(quiz.id, tokens.a1).then((res) => res),
      ]);
      await waitForLockWaiters(2);
      hold.release();
      await hold.done;
      const [one, two] = await both;
      expect([one.status, two.status]).toEqual([200, 200]);
      expect((one.body as AttemptView).id).toBe((two.body as AttemptView).id);
      expect(
        await prisma.quizAttempt.count({ where: { quizId: quiz.id } }),
      ).toBe(1);
    });

    it('resumes an attempt another request is still creating (the unique index, then resume)', async () => {
      const quiz = await createQuiz();
      // Another request (the same student on a second device) has inserted the attempt but
      // not committed yet. This start sees no attempt, inserts, waits on the unique index,
      // gets the duplicate error once the other commits, and must resume that attempt.
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      let heldId = '';
      const held = prisma.$transaction(
        async (tx) => {
          const now = new Date();
          heldId = (
            await tx.quizAttempt.create({
              data: {
                quizId: quiz.id,
                studentId: studentIds.a1,
                startedAt: now,
                expiresAt: new Date(now.getTime() + 20 * MINUTE_MS),
              },
              select: { id: true },
            })
          ).id;
          await released;
        },
        { timeout: 20_000 },
      );
      for (let i = 0; i < 100 && !heldId; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const starting = start(quiz.id, tokens.a1).then((res) => res);
      await waitForLockWaiters(1);
      release();
      await held;

      const res = await starting;
      expect(res.status).toBe(200);
      expect((res.body as AttemptView).id).toBe(heldId);
      expect(
        await prisma.quizAttempt.count({ where: { quizId: quiz.id } }),
      ).toBe(1);
    });

    it("waits for a teacher's edit in progress and starts from the edited settings", async () => {
      const quiz = await createQuiz({ timeLimitMinutes: 20 });
      // The teacher changes the time limit (allowed: nobody has started yet) while the
      // student's start request arrives.
      const hold = holdQuizLikeATeacherEdit(quiz.id, (tx) =>
        tx.quiz.update({
          where: { id: quiz.id },
          data: { timeLimitMinutes: 5 },
        }),
      );
      const starting = start(quiz.id, tokens.a1).then((res) => res);
      await waitForLockWaiters(1);
      hold.release();
      await hold.done;

      const view = (await starting).body as AttemptView;
      expect(
        new Date(view.expiresAt).getTime() - new Date(view.startedAt).getTime(),
      ).toBe(5 * MINUTE_MS);
      expect(view.quiz.timeLimitMinutes).toBe(5);
    });

    it("hides quizzes the student can't see: 404", async () => {
      const otherClass = await createQuiz({ classIds: [class10B] });
      const draft = await createQuiz({ published: false });
      await start(otherClass.id, tokens.a1).expect(404);
      await start(draft.id, tokens.a1).expect(404);
      await start(UNKNOWN_ID, tokens.a1).expect(404);
      expect(
        await prisma.quizAttempt.count({
          where: { quizId: { in: [otherClass.id, draft.id] } },
        }),
      ).toBe(0);
    });

    it('refuses a quiz that is not open yet or already closed: 409', async () => {
      const upcoming = await createQuiz({
        opensAt: hoursFromNow(2),
        closesAt: hoursFromNow(26),
      });
      const closed = await createQuiz({
        opensAt: hoursFromNow(-48),
        closesAt: hoursFromNow(-1),
      });
      const early = await start(upcoming.id, tokens.a1).expect(409);
      const late = await start(closed.id, tokens.a1).expect(409);
      expect(early.body).toMatchObject({
        message: 'This quiz is not open yet',
      });
      expect(late.body).toMatchObject({ message: 'This quiz is closed' });
      expect(
        await prisma.quizAttempt.count({
          where: { quizId: { in: [upcoming.id, closed.id] } },
        }),
      ).toBe(0);
    });

    it('never allows a second attempt: after submitting or after the time ran out', async () => {
      const submitted = await createQuiz();
      await startOk(submitted.id);
      await submit(submitted.id, tokens.a1).expect(200);
      const again = await start(submitted.id, tokens.a1).expect(409);
      expect(again.body).toMatchObject({
        message: 'You have already taken this quiz',
      });

      const timedOut = await createQuiz();
      await startOk(timedOut.id);
      await runOutOfTime(timedOut.id, studentIds.a1);
      await start(timedOut.id, tokens.a1).expect(409);

      expect(
        await prisma.quizAttempt.count({
          where: { quizId: { in: [submitted.id, timedOut.id] } },
        }),
      ).toBe(2);
    });

    it('keeps the deadline when the teacher later moves the closing date; new starts use the new one', async () => {
      // The quiz closes in 5 minutes, so a1's 20-minute attempt is cut to 5 minutes.
      const quiz = await createQuiz({
        closesAt: new Date(Date.now() + 5 * MINUTE_MS),
        timeLimitMinutes: 20,
      });
      const early = await startOk(quiz.id, tokens.a1);

      const extended = hoursFromNow(3);
      await server()
        .patch(`/teacher/quizzes/${quiz.id}`)
        .set('Authorization', `Bearer ${tokens.teacher}`)
        .send({ closesAt: extended.toISOString() })
        .expect(200);

      const after = (await getAttempt(quiz.id, tokens.a1).expect(200))
        .body as AttemptView;
      expect(after.expiresAt).toBe(early.expiresAt);
      // Resuming (starting again) must not recalculate it either.
      const resumed = await startOk(quiz.id, tokens.a1);
      expect(resumed.expiresAt).toBe(early.expiresAt);
      expect(
        (await rowOf(quiz.id, studentIds.a1)).expiresAt.toISOString(),
      ).toBe(early.expiresAt);

      const late = await startOk(quiz.id, tokens.a2);
      expect(
        new Date(late.expiresAt).getTime() - new Date(late.startedAt).getTime(),
      ).toBe(20 * MINUTE_MS);
    });

    it('keeps a running attempt going when the teacher closes the quiz early; new starts are refused', async () => {
      const quiz = await createQuiz({ timeLimitMinutes: 20 });
      const running = await startOk(quiz.id, tokens.a1);

      await server()
        .patch(`/teacher/quizzes/${quiz.id}`)
        .set('Authorization', `Bearer ${tokens.teacher}`)
        .send({ closesAt: new Date(Date.now() - MINUTE_MS).toISOString() })
        .expect(200);

      const after = (await getAttempt(quiz.id, tokens.a1).expect(200))
        .body as AttemptView;
      expect(after.status).toBe('IN_PROGRESS');
      expect(after.expiresAt).toBe(running.expiresAt);
      expect((await startOk(quiz.id, tokens.a1)).expiresAt).toBe(
        running.expiresAt,
      );
      const q = quiz.questions[0];
      await answer(
        quiz.id,
        q.id,
        { optionId: q.optionIds[0] },
        tokens.a1,
      ).expect(200);
      await submit(quiz.id, tokens.a1).expect(200);

      await start(quiz.id, tokens.a2).expect(409);
    });

    it("refuses a teacher's scoring change that races a student's start", async () => {
      // A start holds the quiz row (FOR SHARE) and has inserted its attempt, not committed yet.
      // The teacher's edit must wait for it, then see the attempt and refuse the change.
      const quiz = await createQuiz();
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      const starting = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Quiz" WHERE id = ${quiz.id} FOR SHARE`;
          const now = new Date();
          await tx.quizAttempt.create({
            data: {
              quizId: quiz.id,
              studentId: studentIds.a1,
              startedAt: now,
              expiresAt: new Date(now.getTime() + 20 * MINUTE_MS),
            },
          });
          await released;
        },
        { timeout: 20_000 },
      );
      await waitForLockWaiters(0);
      const editing = server()
        .patch(`/teacher/quizzes/${quiz.id}`)
        .set('Authorization', `Bearer ${tokens.teacher}`)
        .send({ negativeMarkPercent: 0 })
        .then((res) => res);
      await waitForLockWaiters(1);
      release();
      await starting;

      expect((await editing).status).toBe(409);
      const stored = await prisma.quiz.findUniqueOrThrow({
        where: { id: quiz.id },
      });
      expect(stored.negativeMarkPercent).toBe(25);
    });

    it('lets the student resume and answer after the teacher removes their class', async () => {
      const quiz = await createQuiz();
      await startOk(quiz.id);
      await prisma.quizClass.updateMany({
        where: { quizId: quiz.id },
        data: { classId: class10B },
      });
      await startOk(quiz.id);
      const q = quiz.questions[0];
      await answer(
        quiz.id,
        q.id,
        { optionId: q.optionIds[1] },
        tokens.a1,
      ).expect(200);
      // A classmate who never started can't begin it any more.
      await start(quiz.id, tokens.a2).expect(404);
    });
  });

  describe('answers', () => {
    it('saves, changes and clears an answer', async () => {
      const quiz = await createQuiz();
      await startOk(quiz.id);
      const [q1] = quiz.questions;

      const saved = await answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[0] },
        tokens.a1,
      ).expect(200);
      expect(saved.body).toEqual({
        questionId: q1.id,
        optionId: q1.optionIds[0],
      });

      await answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[1] },
        tokens.a1,
      ).expect(200);
      let view = (await getAttempt(quiz.id, tokens.a1).expect(200))
        .body as AttemptView;
      expect(view.answers).toEqual([
        { questionId: q1.id, optionId: q1.optionIds[1] },
      ]);
      expect(view.answeredCount).toBe(1);

      await clear(quiz.id, q1.id, tokens.a1).expect(204);
      await clear(quiz.id, q1.id, tokens.a1).expect(204); // clearing twice is harmless
      view = (await getAttempt(quiz.id, tokens.a1).expect(200))
        .body as AttemptView;
      expect(view.answers).toEqual([]);
      expect(view.answeredCount).toBe(0);
    });

    it("rejects another quiz's question and another question's option", async () => {
      const quiz = await createQuiz();
      const other = await createQuiz();
      await startOk(quiz.id);
      const [q1, q2] = quiz.questions;

      await answer(
        quiz.id,
        other.questions[0].id,
        { optionId: other.questions[0].optionIds[0] },
        tokens.a1,
      ).expect(404);
      await clear(quiz.id, other.questions[0].id, tokens.a1).expect(404);
      const wrongOption = await answer(
        quiz.id,
        q1.id,
        { optionId: q2.optionIds[0] },
        tokens.a1,
      ).expect(400);
      expect(wrongOption.body).toMatchObject({
        message: 'This option does not belong to the question',
      });
      await answer(quiz.id, q1.id, { optionId: UNKNOWN_ID }, tokens.a1).expect(
        400,
      );
      expect(
        await prisma.answer.count({ where: { question: { quizId: quiz.id } } }),
      ).toBe(0);
    });

    it('needs a started attempt, and only ever touches your own', async () => {
      const quiz = await createQuiz();
      const [q1] = quiz.questions;
      await answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[0] },
        tokens.a1,
      ).expect(404);
      await getAttempt(quiz.id, tokens.a1).expect(404);

      await startOk(quiz.id, tokens.a1);
      await answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[0] },
        tokens.a1,
      ).expect(200);
      // A classmate on the same quiz has no attempt of their own: nothing to answer or read.
      await answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[1] },
        tokens.a2,
      ).expect(404);
      await clear(quiz.id, q1.id, tokens.a2).expect(404);
      await submit(quiz.id, tokens.a2).expect(404);
      await getAttempt(quiz.id, tokens.a2).expect(404);

      const mine = (await getAttempt(quiz.id, tokens.a1).expect(200))
        .body as AttemptView;
      expect(mine.answers).toEqual([
        { questionId: q1.id, optionId: q1.optionIds[0] },
      ]);
      expect(mine.status).toBe('IN_PROGRESS');
    });

    it('refuses changes after submitting: 409, and nothing changes', async () => {
      const quiz = await createQuiz();
      await startOk(quiz.id);
      const [q1, q2] = quiz.questions;
      await answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[0] },
        tokens.a1,
      ).expect(200);
      await submit(quiz.id, tokens.a1).expect(200);

      const late = await answer(
        quiz.id,
        q2.id,
        { optionId: q2.optionIds[0] },
        tokens.a1,
      ).expect(409);
      expect(late.body).toMatchObject({
        message: 'This attempt has already been submitted',
      });
      await answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[1] },
        tokens.a1,
      ).expect(409);
      await clear(quiz.id, q1.id, tokens.a1).expect(409);

      const answers = await prisma.answer.findMany({
        where: { attempt: { quizId: quiz.id } },
        select: { questionId: true, optionId: true },
      });
      expect(answers).toEqual([
        { questionId: q1.id, optionId: q1.optionIds[0] },
      ]);
    });

    it('refuses changes once the time is up (server clock): 409, and nothing changes', async () => {
      const quiz = await createQuiz();
      await startOk(quiz.id);
      const [q1, q2] = quiz.questions;
      await answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[0] },
        tokens.a1,
      ).expect(200);
      await runOutOfTime(quiz.id, studentIds.a1);

      const late = await answer(
        quiz.id,
        q2.id,
        { optionId: q2.optionIds[0] },
        tokens.a1,
      ).expect(409);
      expect(late.body).toMatchObject({
        message: 'Time is up for this attempt',
      });
      await answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[1] },
        tokens.a1,
      ).expect(409);
      await clear(quiz.id, q1.id, tokens.a1).expect(409);

      const answers = await prisma.answer.findMany({
        where: { attempt: { quizId: quiz.id } },
        select: { questionId: true, optionId: true },
      });
      expect(answers).toEqual([
        { questionId: q1.id, optionId: q1.optionIds[0] },
      ]);
    });
  });

  describe('submitting', () => {
    it('submits: status SUBMITTED, questions no longer sent, scored', async () => {
      const quiz = await createQuiz();
      await startOk(quiz.id);
      const [q1] = quiz.questions;
      await answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[0] },
        tokens.a1,
      ).expect(200);

      const res = await submit(quiz.id, tokens.a1).expect(200);
      const view = res.body as AttemptView;
      expect(view.status).toBe('SUBMITTED');
      expect(view.submittedAt).not.toBeNull();
      expect(view.answeredCount).toBe(1);
      expect(view.score).toBe(2); // q1 (2 points) answered correctly
      expect(view.maxScore).toBe(5);
      expect(view.questions).toBeUndefined();
      expect(view.answers).toBeUndefined();
      expect(res.text).not.toContain('سؤال 1');

      const row = await prisma.quizAttempt.findUniqueOrThrow({
        where: { id: view.id },
      });
      expect(row.status).toBe('SUBMITTED');
      expect(row.submittedAt?.toISOString()).toBe(view.submittedAt);
    });

    it('is harmless to submit twice', async () => {
      const quiz = await createQuiz();
      await startOk(quiz.id);
      const first = (await submit(quiz.id, tokens.a1).expect(200))
        .body as AttemptView;
      const second = (await submit(quiz.id, tokens.a1).expect(200))
        .body as AttemptView;
      expect(second.submittedAt).toBe(first.submittedAt);
      expect(second.status).toBe('SUBMITTED');
    });

    it('is harmless to submit again after the deadline, once it was submitted in time', async () => {
      // A last-second submit whose response was lost is retried after the deadline.
      const quiz = await createQuiz();
      await startOk(quiz.id);
      await submit(quiz.id, tokens.a1).expect(200);
      await runOutOfTime(quiz.id, studentIds.a1);
      const stored = await rowOf(quiz.id, studentIds.a1);
      const retry = (await submit(quiz.id, tokens.a1).expect(200))
        .body as AttemptView;
      expect(retry.status).toBe('SUBMITTED');
      expect(retry.submittedAt).toBe(stored.submittedAt?.toISOString());
      expect((await rowOf(quiz.id, studentIds.a1)).submittedAt).toEqual(
        stored.submittedAt,
      );
    });

    it('refuses to submit after the time is up; the attempt shows as EXPIRED', async () => {
      const quiz = await createQuiz();
      await startOk(quiz.id);
      await runOutOfTime(quiz.id, studentIds.a1);

      const res = await submit(quiz.id, tokens.a1).expect(409);
      expect(res.body).toMatchObject({
        message: 'Time is up for this attempt',
      });
      const row = await prisma.quizAttempt.findFirstOrThrow({
        where: { quizId: quiz.id },
      });
      expect(row.submittedAt).toBeNull();

      const view = (await getAttempt(quiz.id, tokens.a1).expect(200))
        .body as AttemptView;
      expect(view.status).toBe('EXPIRED');
      expect(view.questions).toBeUndefined();
    });

    it('needs a started attempt', async () => {
      const quiz = await createQuiz();
      await submit(quiz.id, tokens.a1).expect(404);
    });
  });

  describe('when the time is up', () => {
    it('records EXPIRED on the next request and keeps the answers saved in time', async () => {
      const quiz = await createQuiz();
      await startOk(quiz.id);
      const [q1] = quiz.questions;
      await answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[1] },
        tokens.a1,
      ).expect(200);
      await runOutOfTime(quiz.id, studentIds.a1);
      expect((await rowOf(quiz.id, studentIds.a1)).status).toBe('IN_PROGRESS');

      const view = (await getAttempt(quiz.id, tokens.a1).expect(200))
        .body as AttemptView;
      expect(view.status).toBe('EXPIRED');
      expect(view.answeredCount).toBe(1);

      const row = await rowOf(quiz.id, studentIds.a1);
      expect(row.status).toBe('EXPIRED');
      expect(row.submittedAt).toBeNull();
      expect(row.answers.map((a) => a.optionId)).toEqual([q1.optionIds[1]]);
    });

    it('is recorded by any request from the student, e.g. the quiz list', async () => {
      const quiz = await createQuiz();
      await startOk(quiz.id);
      await runOutOfTime(quiz.id, studentIds.a1);
      await server()
        .get('/student/quizzes')
        .set('Authorization', `Bearer ${tokens.a1}`)
        .expect(200);
      expect((await rowOf(quiz.id, studentIds.a1)).status).toBe('EXPIRED');
    });

    it('does not expire an attempt that a submit ends while the expiry step waits for it', async () => {
      // The expiry step reads the attempt as running and overdue, then waits for its row lock.
      // Meanwhile a submit (held here) ends it in time. Once it gets the lock, it must
      // re-check and leave the submission alone.
      const quiz = await createQuiz();
      await startOk(quiz.id);
      await runOutOfTime(quiz.id, studentIds.a1);
      const before = await rowOf(quiz.id, studentIds.a1);
      const submittedAt = new Date(before.expiresAt.getTime() - 1000);
      const hold = holdAttemptRow(quiz.id, studentIds.a1, (tx) =>
        tx.quizAttempt.update({
          where: { id: before.id },
          data: { status: 'SUBMITTED', submittedAt, score: 0, maxScore: 5 },
        }),
      );
      const listing = server()
        .get('/student/quizzes')
        .set('Authorization', `Bearer ${tokens.a1}`)
        .then((r) => r);
      await waitForLockWaiters(1);
      hold.release();
      await hold.done;
      expect((await listing).status).toBe(200);

      const after = await rowOf(quiz.id, studentIds.a1);
      expect(after.status).toBe('SUBMITTED');
      expect(after.submittedAt?.toISOString()).toBe(submittedAt.toISOString());
    });

    it('never turns a submitted attempt into an expired one', async () => {
      const quiz = await createQuiz();
      await startOk(quiz.id);
      const submitted = (await submit(quiz.id, tokens.a1).expect(200))
        .body as AttemptView;
      await runOutOfTime(quiz.id, studentIds.a1);

      await getAttempt(quiz.id, tokens.a1).expect(200);
      const row = await rowOf(quiz.id, studentIds.a1);
      expect(row.status).toBe('SUBMITTED');
      expect(row.submittedAt).not.toBeNull();
      expect(submitted.status).toBe('SUBMITTED');
    });

    it('refuses answers, submission and a new start once expired, and changes nothing', async () => {
      const quiz = await createQuiz();
      await startOk(quiz.id);
      const [q1] = quiz.questions;
      await runOutOfTime(quiz.id, studentIds.a1);
      await getAttempt(quiz.id, tokens.a1).expect(200); // now stored as EXPIRED

      await answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[0] },
        tokens.a1,
      ).expect(409);
      await clear(quiz.id, q1.id, tokens.a1).expect(409);
      await submit(quiz.id, tokens.a1).expect(409);
      await start(quiz.id, tokens.a1).expect(409);

      const row = await rowOf(quiz.id, studentIds.a1);
      expect(row.status).toBe('EXPIRED');
      expect(row.submittedAt).toBeNull();
      expect(row.answers).toEqual([]);
      expect(
        await prisma.quizAttempt.count({ where: { quizId: quiz.id } }),
      ).toBe(1);
    });
  });

  describe('the clock belongs to the server', () => {
    it('ignores times and limits sent with a start', async () => {
      const quiz = await createQuiz({ timeLimitMinutes: 20 });
      const res = await start(quiz.id, tokens.a1)
        .send({
          startedAt: new Date(Date.now() + 60 * MINUTE_MS).toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * MINUTE_MS).toISOString(),
          timeLimitMinutes: 999,
        })
        .expect(200);
      const view = res.body as AttemptView;
      expect(
        new Date(view.expiresAt).getTime() - new Date(view.startedAt).getTime(),
      ).toBe(20 * MINUTE_MS);
      expect(
        Math.abs(new Date(view.startedAt).getTime() - Date.now()),
      ).toBeLessThan(MINUTE_MS);
    });

    it('rejects times sent with an answer, and ignores them on a late submit', async () => {
      const quiz = await createQuiz();
      await startOk(quiz.id);
      const [q1] = quiz.questions;
      await answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[0], answeredAt: new Date().toISOString() },
        tokens.a1,
      ).expect(400);

      await runOutOfTime(quiz.id, studentIds.a1);
      await submit(quiz.id, tokens.a1)
        .send({
          submittedAt: new Date(Date.now() - 60 * MINUTE_MS).toISOString(),
        })
        .expect(409);
      expect((await rowOf(quiz.id, studentIds.a1)).status).toBe('EXPIRED');
    });
  });

  describe('refresh and reconnect', () => {
    it('gives back the same attempt, deadline and saved answers', async () => {
      const quiz = await createQuiz();
      const first = await startOk(quiz.id);
      const [q1, q2] = quiz.questions;
      await answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[0] },
        tokens.a1,
      ).expect(200);
      await answer(
        quiz.id,
        q2.id,
        { optionId: q2.optionIds[1] },
        tokens.a1,
      ).expect(200);

      // A reloaded page reads the attempt; a second device (or the details page) starts again.
      const reloaded = (await getAttempt(quiz.id, tokens.a1).expect(200))
        .body as AttemptView;
      const restarted = await startOk(quiz.id);
      for (const view of [reloaded, restarted]) {
        expect(view.id).toBe(first.id);
        expect(view.expiresAt).toBe(first.expiresAt);
        expect(view.status).toBe('IN_PROGRESS');
        expect(view.answers).toEqual(
          expect.arrayContaining([
            { questionId: q1.id, optionId: q1.optionIds[0] },
            { questionId: q2.id, optionId: q2.optionIds[1] },
          ]),
        );
      }
    });
  });

  describe('races on one attempt', () => {
    it('refuses an answer that arrives while the submit is being saved', async () => {
      const quiz = await createQuiz();
      await startOk(quiz.id);
      const [q1] = quiz.questions;

      const hold = holdAttemptRow(quiz.id, studentIds.a1);
      const submitting = submit(quiz.id, tokens.a1).then((res) => res);
      await waitForLockWaiters(1);
      const answering = answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[0] },
        tokens.a1,
      ).then((res) => res);
      await waitForLockWaiters(2);
      hold.release();
      await hold.done;

      expect((await submitting).status).toBe(200);
      expect((await answering).status).toBe(409);
      const row = await rowOf(quiz.id, studentIds.a1);
      expect(row.status).toBe('SUBMITTED');
      expect(row.answers).toEqual([]);
    });

    it('refuses an answer, a clear and a submit whose deadline passes while they wait for the lock', async () => {
      // Each request passes the expiry step (not overdue yet) and queues on the row lock.
      // While it waits, the deadline passes. The check made after the lock must refuse it.
      for (const kind of ['answer', 'clear', 'submit'] as const) {
        const quiz = await createQuiz();
        await startOk(quiz.id);
        const [q1] = quiz.questions;
        if (kind === 'clear') {
          await answer(
            quiz.id,
            q1.id,
            { optionId: q1.optionIds[0] },
            tokens.a1,
          ).expect(200);
        }
        const hold = holdAttemptRow(quiz.id, studentIds.a1, async (tx) => {
          const now = Date.now();
          await tx.quizAttempt.update({
            where: {
              quizId_studentId: { quizId: quiz.id, studentId: studentIds.a1 },
            },
            data: {
              startedAt: new Date(now - 20 * MINUTE_MS),
              expiresAt: new Date(now),
            },
          });
        });
        const pending =
          kind === 'answer'
            ? answer(
                quiz.id,
                q1.id,
                { optionId: q1.optionIds[0] },
                tokens.a1,
              ).then((r) => r)
            : kind === 'clear'
              ? clear(quiz.id, q1.id, tokens.a1).then((r) => r)
              : submit(quiz.id, tokens.a1).then((r) => r);
        await waitForLockWaiters(1);
        hold.release();
        await hold.done;

        const res = await pending;
        expect([kind, res.status]).toEqual([kind, 409]);
        const row = await rowOf(quiz.id, studentIds.a1);
        expect(row.submittedAt).toBeNull();
        // The answer wasn't saved, and the one to be cleared is still there.
        expect([kind, row.answers.length]).toEqual([
          kind,
          kind === 'clear' ? 1 : 0,
        ]);
      }
    });

    it('keeps an answer that arrives just before the submit', async () => {
      const quiz = await createQuiz();
      await startOk(quiz.id);
      const [q1] = quiz.questions;

      const hold = holdAttemptRow(quiz.id, studentIds.a1);
      const answering = answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[0] },
        tokens.a1,
      ).then((res) => res);
      await waitForLockWaiters(1);
      const submitting = submit(quiz.id, tokens.a1).then((res) => res);
      await waitForLockWaiters(2);
      hold.release();
      await hold.done;

      expect((await answering).status).toBe(200);
      const submitted = await submitting;
      expect(submitted.status).toBe(200);
      expect((submitted.body as AttemptView).answeredCount).toBe(1);
      expect((submitted.body as AttemptView).score).toBe(2); // q1 answered correctly
      const row = await rowOf(quiz.id, studentIds.a1);
      expect(row.answers.map((a) => a.pointsAwarded?.toNumber())).toEqual([2]);
    });

    it('submits once when two submits arrive together', async () => {
      const quiz = await createQuiz();
      await startOk(quiz.id);

      const hold = holdAttemptRow(quiz.id, studentIds.a1);
      const both = Promise.all([
        submit(quiz.id, tokens.a1).then((res) => res),
        submit(quiz.id, tokens.a1).then((res) => res),
      ]);
      await waitForLockWaiters(2);
      hold.release();
      await hold.done;

      const [one, two] = await both;
      expect([one.status, two.status]).toEqual([200, 200]);
      expect((one.body as AttemptView).submittedAt).toBe(
        (two.body as AttemptView).submittedAt,
      );
    });
  });

  describe('database safety nets (the API never gets this far)', () => {
    async function createRawAttempt(data: {
      status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
      startedAt: Date;
      expiresAt: Date;
      submittedAt: Date | null;
      score?: number | null;
      maxScore?: number | null;
    }) {
      const quiz = await createQuiz();
      const finished = data.status !== 'IN_PROGRESS';
      return prisma.quizAttempt.create({
        data: {
          quizId: quiz.id,
          studentId: studentIds.b1,
          score: finished ? 0 : null,
          maxScore: finished ? 5 : null,
          ...data,
        },
      });
    }
    const t = (minutes: number) => new Date(Date.now() + minutes * MINUTE_MS);

    it('rejects a second attempt for the same student and quiz (unique index)', async () => {
      const quiz = await createQuiz();
      const data = {
        quizId: quiz.id,
        studentId: studentIds.b1,
        startedAt: t(-5),
        expiresAt: t(15),
      };
      await prisma.quizAttempt.create({ data });
      await expect(prisma.quizAttempt.create({ data })).rejects.toThrow(
        /Unique constraint/,
      );
    });

    it('rejects a deadline that is not after the start', async () => {
      const at = t(0);
      await expect(
        createRawAttempt({
          status: 'IN_PROGRESS',
          startedAt: at,
          expiresAt: at,
          submittedAt: null,
        }),
      ).rejects.toThrow(/QuizAttempt_expiresAt_after_startedAt/);
    });

    it('rejects a submission time that does not match the status', async () => {
      await expect(
        createRawAttempt({
          status: 'SUBMITTED',
          startedAt: t(-5),
          expiresAt: t(15),
          submittedAt: null,
        }),
      ).rejects.toThrow(/QuizAttempt_submittedAt_iff_submitted/);
      await expect(
        createRawAttempt({
          status: 'EXPIRED',
          startedAt: t(-30),
          expiresAt: t(-10),
          submittedAt: t(-20),
        }),
      ).rejects.toThrow(/QuizAttempt_submittedAt_iff_submitted/);
    });

    it('rejects a submission at or after the deadline', async () => {
      await expect(
        createRawAttempt({
          status: 'SUBMITTED',
          startedAt: t(-30),
          expiresAt: t(-10),
          submittedAt: t(-10),
        }),
      ).rejects.toThrow(/QuizAttempt_submittedAt_before_expiresAt/);
    });

    it('rejects a finished attempt without a score, and a running one with a score', async () => {
      await expect(
        createRawAttempt({
          status: 'EXPIRED',
          startedAt: t(-30),
          expiresAt: t(-10),
          submittedAt: null,
          score: null,
          maxScore: null,
        }),
      ).rejects.toThrow(/QuizAttempt_scored_iff_finished/);
      await expect(
        createRawAttempt({
          status: 'IN_PROGRESS',
          startedAt: t(-5),
          expiresAt: t(15),
          submittedAt: null,
          score: 3,
          maxScore: 5,
        }),
      ).rejects.toThrow(/QuizAttempt_scored_iff_finished/);
    });

    it('rejects a score below 0 or above the maximum', async () => {
      for (const score of [-0.25, 5.01]) {
        await expect(
          createRawAttempt({
            status: 'EXPIRED',
            startedAt: t(-30),
            expiresAt: t(-10),
            submittedAt: null,
            score,
            maxScore: 5,
          }),
        ).rejects.toThrow(/QuizAttempt_score_in_range/);
      }
    });
  });

  // The quiz from createQuiz: question 1 is worth 2 points, question 2 is worth 3 (5 in total).
  // Option 0 is the correct one, option 1 is wrong. Negative marking is 25% unless set.
  describe('scoring (always on the server)', () => {
    async function takeQuiz(
      answers: (0 | 1 | null)[], // the chosen option per question, or null to leave it blank
      negativeMarkPercent = 25,
    ) {
      const quiz = await createQuiz({ negativeMarkPercent });
      await startOk(quiz.id);
      for (const [i, choice] of answers.entries()) {
        if (choice === null) continue;
        const q = quiz.questions[i];
        await answer(
          quiz.id,
          q.id,
          { optionId: q.optionIds[choice] },
          tokens.a1,
        ).expect(200);
      }
      return quiz;
    }
    async function submitted(quizId: string) {
      return (await submit(quizId, tokens.a1).expect(200)).body as AttemptView;
    }
    const storedAnswers = async (quizId: string) =>
      (await rowOf(quizId, studentIds.a1)).answers
        .map((a) => a.pointsAwarded?.toNumber())
        .sort((x, y) => (x ?? 0) - (y ?? 0));

    it('all correct: every point', async () => {
      const quiz = await takeQuiz([0, 0]);
      const view = await submitted(quiz.id);
      expect([view.score, view.maxScore]).toEqual([5, 5]);
    });

    it('all incorrect with negative marking: deductions recorded, total floored at 0', async () => {
      const quiz = await takeQuiz([1, 1]);
      expect((await submitted(quiz.id)).score).toBe(0);
      // −25% of 2 and −25% of 3
      expect(await storedAnswers(quiz.id)).toEqual([-0.75, -0.5]);
    });

    it('unanswered questions earn nothing and cost nothing', async () => {
      const blank = await takeQuiz([null, null]);
      expect((await submitted(blank.id)).score).toBe(0);
      const oneBlank = await takeQuiz([null, 0]);
      expect((await submitted(oneBlank.id)).score).toBe(3);
    });

    it('mixed answers with negative marking: +2 − 25% of 3 = 1.25', async () => {
      const quiz = await takeQuiz([0, 1]);
      const view = await submitted(quiz.id);
      expect(view.score).toBe(1.25);
      expect(await storedAnswers(quiz.id)).toEqual([-0.75, 2]);
      const row = await rowOf(quiz.id, studentIds.a1);
      expect(row.score?.toString()).toBe('1.25');
      expect(row.maxScore).toBe(5);
    });

    it('mixed answers without negative marking: wrong answers cost nothing', async () => {
      const quiz = await takeQuiz([0, 1], 0);
      expect((await submitted(quiz.id)).score).toBe(2);
      expect(await storedAnswers(quiz.id)).toEqual([0, 2]);
    });

    it('scores an attempt whose time ran out, from the answers saved in time', async () => {
      const quiz = await takeQuiz([0, 1]);
      await runOutOfTime(quiz.id, studentIds.a1);
      const view = (await getAttempt(quiz.id, tokens.a1).expect(200))
        .body as AttemptView;
      expect(view.status).toBe('EXPIRED');
      expect([view.score, view.maxScore]).toEqual([1.25, 5]);
      expect((await rowOf(quiz.id, studentIds.a1)).score?.toString()).toBe(
        '1.25',
      );
    });

    it('ignores a score sent by the client', async () => {
      const quiz = await takeQuiz([1, 1]);
      const res = await submit(quiz.id, tokens.a1)
        .send({ score: 5, maxScore: 5, pointsAwarded: 5 })
        .expect(200);
      expect((res.body as AttemptView).score).toBe(0);
    });

    it('shows no score while the attempt is running', async () => {
      const quiz = await takeQuiz([0, 0]);
      const view = (await getAttempt(quiz.id, tokens.a1).expect(200))
        .body as AttemptView;
      expect([view.score, view.maxScore]).toEqual([null, null]);
      expect(await storedAnswers(quiz.id)).toEqual([undefined, undefined]);
    });

    it('uses the option marked correct, wherever it is listed', async () => {
      const quiz = await createQuiz({ correctListedSecond: true });
      await startOk(quiz.id);
      // optionIds follow the listed order: [wrong, correct] for every question here.
      const [q1, q2] = quiz.questions;
      await answer(
        quiz.id,
        q1.id,
        { optionId: q1.optionIds[1] },
        tokens.a1,
      ).expect(200);
      await answer(
        quiz.id,
        q2.id,
        { optionId: q2.optionIds[0] },
        tokens.a1,
      ).expect(200);
      // +2 for question 1, −25% of 3 for question 2
      expect((await submitted(quiz.id)).score).toBe(1.25);
    });

    it('keeps the score when the attempt is read again', async () => {
      const quiz = await takeQuiz([0, 1]);
      await submitted(quiz.id);
      const again = (await getAttempt(quiz.id, tokens.a1).expect(200))
        .body as AttemptView;
      expect([again.score, again.maxScore]).toEqual([1.25, 5]);
    });
  });
});
