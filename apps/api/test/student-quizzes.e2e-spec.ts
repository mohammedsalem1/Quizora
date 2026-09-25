import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers';

type StudentQuiz = {
  id: string;
  title: string;
  description: string | null;
  opensAt: string;
  closesAt: string;
  timeLimitMinutes: number;
  negativeMarkPercent: number;
  questionCount: number;
  totalPoints: number;
  state: string;
  score: number | null;
  maxScore: number | null;
};

const HOUR_MS = 60 * 60 * 1000;
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR_MS);
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const SECRET_OPTION = 'the-correct-option-text';

describe('Student quiz availability (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let class10A: string;
  let class10B: string;
  let teacherId: string;
  let tokens: Record<'teacher' | 'a1' | 'a2' | 'b1', string>;
  let studentIds: Record<'a1' | 'a2' | 'b1', string>;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    jwt = app.get(JwtService);

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

  // A quiz with two questions (2 + 3 points) whose correct option must never reach students.
  async function createQuiz(options: {
    title: string;
    classIds: string[];
    opensAt?: Date;
    closesAt?: Date;
    published?: boolean;
  }) {
    const quiz = await prisma.quiz.create({
      data: {
        title: options.title,
        description: 'وصف قصير',
        teacherId,
        opensAt: options.opensAt ?? hoursFromNow(-1),
        closesAt: options.closesAt ?? hoursFromNow(24),
        timeLimitMinutes: 20,
        negativeMarkPercent: 25,
        publishedAt: options.published === false ? null : hoursFromNow(-48),
        classes: { create: options.classIds.map((classId) => ({ classId })) },
        questions: {
          create: [2, 3].map((points, i) => ({
            text: `سؤال ${i + 1}`,
            points,
            position: i + 1,
            options: {
              create: [
                { text: SECRET_OPTION, isCorrect: true, position: 1 },
                { text: `wrong ${i}`, isCorrect: false, position: 2 },
              ],
            },
          })),
        },
      },
    });
    return quiz.id;
  }

  // An attempt that started 20 minutes before its deadline and, if SUBMITTED, was submitted
  // a minute after starting. A finished one has a score (the database checks all of this).
  function startAttempt(
    quizId: string,
    studentId: string,
    status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED',
    expiresAt: Date,
  ) {
    const startedAt = new Date(expiresAt.getTime() - 20 * 60 * 1000);
    return prisma.quizAttempt.create({
      data: {
        quizId,
        studentId,
        status,
        startedAt,
        expiresAt,
        submittedAt:
          status === 'SUBMITTED'
            ? new Date(startedAt.getTime() + 60 * 1000)
            : null,
        score: status === 'IN_PROGRESS' ? null : 0,
        maxScore: status === 'IN_PROGRESS' ? null : 5,
      },
    });
  }

  const get = (path: string, token: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`);

  async function listFor(token: string) {
    const res = await get('/student/quizzes', token).expect(200);
    return res.body as StudentQuiz[];
  }

  async function stateOf(quizId: string, token: string) {
    const res = await get(`/student/quizzes/${quizId}`, token).expect(200);
    return (res.body as StudentQuiz).state;
  }

  describe('access', () => {
    it('requires a login', async () => {
      await request(app.getHttpServer()).get('/student/quizzes').expect(401);
    });

    it('refuses teachers', async () => {
      const quizId = await createQuiz({
        title: 'teacher cannot use student routes',
        classIds: [class10A],
      });
      await get('/student/quizzes', tokens.teacher).expect(403);
      await get(`/student/quizzes/${quizId}`, tokens.teacher).expect(403);
    });

    it('rejects malformed ids and hides ids that do not exist', async () => {
      await get('/student/quizzes/not-a-uuid', tokens.a1).expect(400);
      await get(`/student/quizzes/${UNKNOWN_ID}`, tokens.a1).expect(404);
    });
  });

  describe('the availability window', () => {
    it('is NOT_OPEN_YET before the quiz opens', async () => {
      const quizId = await createQuiz({
        title: 'upcoming',
        classIds: [class10A],
        opensAt: hoursFromNow(2),
        closesAt: hoursFromNow(26),
      });
      expect(await stateOf(quizId, tokens.a1)).toBe('NOT_OPEN_YET');
    });

    it('is AVAILABLE while the quiz is open, with what a student needs to decide', async () => {
      const quizId = await createQuiz({
        title: 'اختبار مفتوح',
        classIds: [class10A],
      });
      const res = await get(`/student/quizzes/${quizId}`, tokens.a1).expect(
        200,
      );
      expect(res.body).toEqual({
        id: quizId,
        title: 'اختبار مفتوح',
        description: 'وصف قصير',
        opensAt: expect.any(String) as string,
        closesAt: expect.any(String) as string,
        timeLimitMinutes: 20,
        negativeMarkPercent: 25,
        questionCount: 2,
        totalPoints: 5,
        state: 'AVAILABLE',
        score: null,
        maxScore: null,
      });
    });

    it('is CLOSED after the quiz closes', async () => {
      const quizId = await createQuiz({
        title: 'closed',
        classIds: [class10A],
        opensAt: hoursFromNow(-48),
        closesAt: hoursFromNow(-1),
      });
      expect(await stateOf(quizId, tokens.a1)).toBe('CLOSED');
    });
  });

  describe('class assignment and drafts', () => {
    it("hides another class's quiz: 404, and left out of the list", async () => {
      const quizId = await createQuiz({
        title: 'only 10B',
        classIds: [class10B],
      });
      await get(`/student/quizzes/${quizId}`, tokens.a1).expect(404);
      expect((await listFor(tokens.a1)).map((q) => q.id)).not.toContain(quizId);
      expect(await stateOf(quizId, tokens.b1)).toBe('AVAILABLE');
    });

    it('shows a quiz assigned to several classes to each of them', async () => {
      const quizId = await createQuiz({
        title: 'shared',
        classIds: [class10A, class10B],
      });
      expect(await stateOf(quizId, tokens.a1)).toBe('AVAILABLE');
      expect(await stateOf(quizId, tokens.b1)).toBe('AVAILABLE');
    });

    it('hides a draft even inside its window: 404, and left out of the list', async () => {
      const quizId = await createQuiz({
        title: 'draft',
        classIds: [class10A],
        published: false,
      });
      await get(`/student/quizzes/${quizId}`, tokens.a1).expect(404);
      expect((await listFor(tokens.a1)).map((q) => q.id)).not.toContain(quizId);
    });

    it('lists exactly the quizzes a student may see, each with its state', async () => {
      const open = await createQuiz({
        title: 'list: open',
        classIds: [class10A],
      });
      const upcoming = await createQuiz({
        title: 'list: upcoming',
        classIds: [class10A],
        opensAt: hoursFromNow(5),
        closesAt: hoursFromNow(30),
      });
      const draft = await createQuiz({
        title: 'list: draft',
        classIds: [class10A],
        published: false,
      });
      const otherClass = await createQuiz({
        title: 'list: 10B',
        classIds: [class10B],
      });

      const byId = new Map(
        (await listFor(tokens.a1)).map((q) => [q.id, q.state]),
      );
      expect(byId.get(open)).toBe('AVAILABLE');
      expect(byId.get(upcoming)).toBe('NOT_OPEN_YET');
      expect(byId.has(draft)).toBe(false);
      expect(byId.has(otherClass)).toBe(false);
    });
  });

  describe('a previous attempt', () => {
    it('shows IN_PROGRESS while the attempt is running (the student may resume)', async () => {
      const quizId = await createQuiz({
        title: 'running',
        classIds: [class10A],
      });
      await startAttempt(
        quizId,
        studentIds.a1,
        'IN_PROGRESS',
        hoursFromNow(0.25),
      );
      expect(await stateOf(quizId, tokens.a1)).toBe('IN_PROGRESS');
    });

    it('shows FINISHED once submitted, even though the quiz is still open', async () => {
      const quizId = await createQuiz({
        title: 'submitted',
        classIds: [class10A],
      });
      await startAttempt(
        quizId,
        studentIds.a1,
        'SUBMITTED',
        hoursFromNow(0.25),
      );
      expect(await stateOf(quizId, tokens.a1)).toBe('FINISHED');
    });

    it('shows the student their own score once finished, and none while running', async () => {
      const done = await createQuiz({ title: 'scored', classIds: [class10A] });
      const running = await createQuiz({
        title: 'running',
        classIds: [class10A],
      });
      const finished = await startAttempt(
        done,
        studentIds.a1,
        'SUBMITTED',
        hoursFromNow(0.25),
      );
      await prisma.quizAttempt.update({
        where: { id: finished.id },
        data: { score: 3.5 },
      });
      await startAttempt(
        running,
        studentIds.a1,
        'IN_PROGRESS',
        hoursFromNow(0.25),
      );

      const detail = (
        await get(`/student/quizzes/${done}`, tokens.a1).expect(200)
      ).body as StudentQuiz;
      expect([detail.score, detail.maxScore]).toEqual([3.5, 5]);
      const listed = new Map((await listFor(tokens.a1)).map((q) => [q.id, q]));
      expect([listed.get(done)?.score, listed.get(done)?.maxScore]).toEqual([
        3.5, 5,
      ]);
      expect([
        listed.get(running)?.score,
        listed.get(running)?.maxScore,
      ]).toEqual([null, null]);
      // A classmate sees the quiz, but not a1's score.
      const classmate = (
        await get(`/student/quizzes/${done}`, tokens.a2).expect(200)
      ).body as StudentQuiz;
      expect([classmate.state, classmate.score]).toEqual(['AVAILABLE', null]);
    });

    it('shows FINISHED once the time is up, whether or not it was finalized yet', async () => {
      const expired = await createQuiz({
        title: 'expired',
        classIds: [class10A],
      });
      await startAttempt(expired, studentIds.a1, 'EXPIRED', hoursFromNow(-0.5));
      expect(await stateOf(expired, tokens.a1)).toBe('FINISHED');

      const timedOut = await createQuiz({
        title: 'timed out',
        classIds: [class10A],
      });
      await startAttempt(
        timedOut,
        studentIds.a1,
        'IN_PROGRESS',
        hoursFromNow(-0.01),
      );
      expect(await stateOf(timedOut, tokens.a1)).toBe('FINISHED');

      // Reading it ended and scored the attempt, so its score is there too (0 of 5: no answers).
      const detail = (
        await get(`/student/quizzes/${timedOut}`, tokens.a1).expect(200)
      ).body as StudentQuiz;
      expect([detail.score, detail.maxScore]).toEqual([0, 5]);
      const listed = (await listFor(tokens.a1)).find((q) => q.id === timedOut);
      expect([listed?.score, listed?.maxScore]).toEqual([0, 5]);
      const row = await prisma.quizAttempt.findFirstOrThrow({
        where: { quizId: timedOut, studentId: studentIds.a1 },
      });
      expect(row.status).toBe('EXPIRED');
    });

    it("doesn't affect a classmate who hasn't started", async () => {
      const quizId = await createQuiz({
        title: 'classmate',
        classIds: [class10A],
      });
      await startAttempt(quizId, studentIds.a1, 'SUBMITTED', hoursFromNow(-1));
      expect(await stateOf(quizId, tokens.a1)).toBe('FINISHED');
      expect(await stateOf(quizId, tokens.a2)).toBe('AVAILABLE');
    });

    it('stays FINISHED after the quiz closes, while a classmate who never started sees CLOSED', async () => {
      const quizId = await createQuiz({
        title: 'finished then closed',
        classIds: [class10A],
        opensAt: hoursFromNow(-48),
        closesAt: hoursFromNow(-1),
      });
      await startAttempt(quizId, studentIds.a1, 'SUBMITTED', hoursFromNow(-2));
      expect(await stateOf(quizId, tokens.a1)).toBe('FINISHED');
      const listed = (await listFor(tokens.a1)).find((q) => q.id === quizId);
      expect(listed?.state).toBe('FINISHED');
      expect(await stateOf(quizId, tokens.a2)).toBe('CLOSED');
    });

    it('keeps a started quiz visible to its student after the teacher removes their class', async () => {
      const running = await createQuiz({
        title: 'moved: running',
        classIds: [class10A],
      });
      const finished = await createQuiz({
        title: 'moved: finished',
        classIds: [class10A],
      });
      await startAttempt(
        running,
        studentIds.a1,
        'IN_PROGRESS',
        hoursFromNow(0.25),
      );
      await startAttempt(
        finished,
        studentIds.a1,
        'SUBMITTED',
        hoursFromNow(-1),
      );
      await prisma.quizClass.updateMany({
        where: { quizId: { in: [running, finished] } },
        data: { classId: class10B },
      });

      expect(await stateOf(running, tokens.a1)).toBe('IN_PROGRESS');
      expect(await stateOf(finished, tokens.a1)).toBe('FINISHED');
      const listed = (await listFor(tokens.a1)).map((q) => q.id);
      expect(listed).toEqual(expect.arrayContaining([running, finished]));

      // A classmate who never started no longer sees it.
      await get(`/student/quizzes/${running}`, tokens.a2).expect(404);
      expect((await listFor(tokens.a2)).map((q) => q.id)).not.toContain(
        running,
      );
    });
  });

  it('never sends questions, options or correct answers to students', async () => {
    const quizId = await createQuiz({
      title: 'no leaks',
      classIds: [class10A],
    });
    const detail = await get(`/student/quizzes/${quizId}`, tokens.a1).expect(
      200,
    );
    const list = await get('/student/quizzes', tokens.a1).expect(200);

    for (const body of [detail.text, list.text]) {
      expect(body).not.toContain(SECRET_OPTION);
      expect(body).not.toContain('isCorrect');
      expect(body).not.toContain('"options"');
      expect(body).not.toContain('"questions"');
      expect(body).not.toContain('سؤال 1');
    }
  });
});
