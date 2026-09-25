import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers';

type Results = {
  quiz: {
    id: string;
    title: string;
    questionCount: number;
    maxScore: number;
    negativeMarkPercent: number;
    classes: { id: string; name: string }[];
  };
  summary: {
    students: number;
    notStarted: number;
    inProgress: number;
    submitted: number;
    expired: number;
    scored: number;
    average: number | null;
    highest: number | null;
    lowest: number | null;
  };
  questions: {
    id: string;
    position: number;
    text: string;
    points: number;
    correct: number;
    wrong: number;
    unanswered: number;
  }[];
  students: {
    id: string;
    fullName: string;
    username: string;
    className: string | null;
    status: string;
    score: number | null;
    answeredCount: number;
    startedAt: string | null;
    finishedAt: string | null;
  }[];
};

const MINUTE_MS = 60 * 1000;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('Teacher quiz results (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let classIds: Record<'10A' | '10B' | '11A', string>;
  let users: Record<string, { id: string; token: string }>;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const jwt = app.get(JwtService);

    classIds = {
      '10A': (await prisma.class.create({ data: { name: '10A' } })).id,
      '10B': (await prisma.class.create({ data: { name: '10B' } })).id,
      '11A': (await prisma.class.create({ data: { name: '11A' } })).id,
    };
    // username -> [full name, class]; teachers have no class. Names are made up.
    const people: Record<string, [string, keyof typeof classIds | null]> = {
      teacher1: ['المعلّمة الأولى', null],
      teacher2: ['المعلّم الثاني', null],
      a1: ['أحمد', '10A'],
      a2: ['بشرى', '10A'],
      a3: ['جود', '10A'],
      a4: ['دانة', '10A'],
      b1: ['رامي', '10B'],
      c1: ['سلمى', '11A'],
    };
    users = {};
    for (const [username, [fullName, className]] of Object.entries(people)) {
      const user = await prisma.user.create({
        data: {
          username,
          fullName,
          passwordHash: 'not-used',
          role: className ? 'STUDENT' : 'TEACHER',
          classId: className ? classIds[className] : null,
        },
      });
      users[username] = { id: user.id, token: jwt.sign({ sub: user.id }) };
    }
  });

  afterAll(async () => {
    await app.close();
  });

  // Two questions worth 2 and 3 points (5 in total); option 0 is correct, option 1 is wrong.
  async function createQuiz(classNames: (keyof typeof classIds)[]) {
    const quiz = await prisma.quiz.create({
      data: {
        title: 'اختبار النتائج',
        teacherId: users.teacher1.id,
        opensAt: new Date(Date.now() - 60 * MINUTE_MS),
        closesAt: new Date(Date.now() + 24 * 60 * MINUTE_MS),
        timeLimitMinutes: 20,
        negativeMarkPercent: 25,
        publishedAt: new Date(Date.now() - 120 * MINUTE_MS),
        classes: {
          create: classNames.map((name) => ({ classId: classIds[name] })),
        },
        questions: {
          create: [2, 3].map((points, i) => ({
            text: `سؤال ${i + 1}`,
            points,
            position: i + 1,
            options: {
              create: [
                { text: 'صحيح', isCorrect: true, position: 1 },
                { text: 'خطأ', isCorrect: false, position: 2 },
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
    return quiz;
  }

  type Quiz = Awaited<ReturnType<typeof createQuiz>>;
  const server = () => request(app.getHttpServer());
  const as = (username: string) => `Bearer ${users[username].token}`;

  // A student takes the quiz through the real API: `choices` is the option per question
  // (0 = correct, 1 = wrong, null = blank); `submitIt` submits at the end.
  async function take(
    quiz: Quiz,
    username: string,
    choices: (0 | 1 | null)[],
    submitIt: boolean,
  ) {
    const base = `/student/quizzes/${quiz.id}/attempt`;
    await server().post(base).set('Authorization', as(username)).expect(200);
    for (const [i, choice] of choices.entries()) {
      if (choice === null) continue;
      const q = quiz.questions[i];
      await server()
        .put(`${base}/answers/${q.id}`)
        .set('Authorization', as(username))
        .send({ optionId: q.options[choice].id })
        .expect(200);
    }
    if (submitIt) {
      await server()
        .post(`${base}/submit`)
        .set('Authorization', as(username))
        .expect(200);
    }
  }

  // Moves a running attempt into the past so its deadline was a minute ago.
  async function runOutOfTime(quizId: string, username: string) {
    const attempt = await prisma.quizAttempt.findUniqueOrThrow({
      where: { quizId_studentId: { quizId, studentId: users[username].id } },
    });
    const shift = attempt.expiresAt.getTime() - Date.now() + MINUTE_MS;
    await prisma.quizAttempt.update({
      where: { id: attempt.id },
      data: {
        startedAt: new Date(attempt.startedAt.getTime() - shift),
        expiresAt: new Date(attempt.expiresAt.getTime() - shift),
      },
    });
  }

  const results = (quizId: string, username = 'teacher1') =>
    server()
      .get(`/teacher/quizzes/${quizId}/results`)
      .set('Authorization', as(username));

  describe('access', () => {
    it('is only for the teacher who owns the quiz', async () => {
      const quiz = await createQuiz(['10A']);
      await server().get(`/teacher/quizzes/${quiz.id}/results`).expect(401);
      await results(quiz.id, 'a1').expect(403);
      await results(quiz.id, 'teacher2').expect(404);
      await results(UNKNOWN_ID).expect(404);
      await server()
        .get('/teacher/quizzes/not-a-uuid/results')
        .set('Authorization', as('teacher1'))
        .expect(400);
      await results(quiz.id).expect(200);
    });

    it("checks ownership before touching anything: another teacher's request doesn't end attempts", async () => {
      const quiz = await createQuiz(['10A']);
      await take(quiz, 'a1', [0, null], false);
      await runOutOfTime(quiz.id, 'a1');
      const attemptOf = () =>
        prisma.quizAttempt.findUniqueOrThrow({
          where: {
            quizId_studentId: { quizId: quiz.id, studentId: users.a1.id },
          },
        });

      await results(quiz.id, 'teacher2').expect(404);
      const untouched = await attemptOf();
      expect([untouched.status, untouched.score]).toEqual([
        'IN_PROGRESS',
        null,
      ]);

      await results(quiz.id).expect(200);
      expect((await attemptOf()).status).toBe('EXPIRED');
    });
  });

  describe('a class that took the quiz', () => {
    let quiz: Quiz;
    let body: Results;

    beforeAll(async () => {
      quiz = await createQuiz(['10A', '10B']);
      await take(quiz, 'a1', [0, 0], true); // 2 + 3 = 5
      await take(quiz, 'a2', [0, 1], true); // 2 − 25% of 3 = 1.25
      await take(quiz, 'a3', [1, null], false); // still answering
      // a4 never starts
      await take(quiz, 'b1', [0, null], false); // leaves after one answer...
      await runOutOfTime(quiz.id, 'b1'); // ...and never comes back
      body = (await results(quiz.id).expect(200)).body as Results;
    });

    it('ends and scores the attempt of a student who never came back', async () => {
      const attempt = await prisma.quizAttempt.findUniqueOrThrow({
        where: {
          quizId_studentId: { quizId: quiz.id, studentId: users.b1.id },
        },
      });
      expect(attempt.status).toBe('EXPIRED');
      expect(attempt.score?.toNumber()).toBe(2);
    });

    it('summarizes who is where, and the scores', () => {
      expect(body.summary).toEqual({
        students: 5,
        notStarted: 1,
        inProgress: 1,
        submitted: 2,
        expired: 1,
        scored: 3,
        average: 2.75, // (5 + 1.25 + 2) / 3
        highest: 5,
        lowest: 1.25,
      });
      expect(body.quiz).toMatchObject({
        id: quiz.id,
        title: 'اختبار النتائج',
        questionCount: 2,
        maxScore: 5,
        negativeMarkPercent: 25,
      });
    });

    it('tallies each question over finished attempts only', () => {
      expect(
        body.questions.map(
          ({ position, points, correct, wrong, unanswered }) => ({
            position,
            points,
            correct,
            wrong,
            unanswered,
          }),
        ),
      ).toEqual([
        // a1, a2 and b1 got question 1 right; a3's wrong answer doesn't count yet
        { position: 1, points: 2, correct: 3, wrong: 0, unanswered: 0 },
        // a1 right, a2 wrong, b1 left it blank
        { position: 2, points: 3, correct: 1, wrong: 1, unanswered: 1 },
      ]);
    });

    it('lists every student of the assigned classes, by class then name', async () => {
      expect(
        body.students.map((s) => [s.username, s.className, s.status, s.score]),
      ).toEqual([
        ['a1', '10A', 'SUBMITTED', 5],
        ['a2', '10A', 'SUBMITTED', 1.25],
        ['a3', '10A', 'IN_PROGRESS', null],
        ['a4', '10A', 'NOT_STARTED', null],
        ['b1', '10B', 'EXPIRED', 2],
      ]);
      const byUser = new Map(body.students.map((s) => [s.username, s]));
      expect(byUser.get('a3')?.answeredCount).toBe(1);
      expect(byUser.get('a4')?.startedAt).toBeNull();
      // Submitted: the submission time. Timed out: the deadline.
      const rowFor = (username: string) =>
        prisma.quizAttempt.findUniqueOrThrow({
          where: {
            quizId_studentId: {
              quizId: quiz.id,
              studentId: users[username].id,
            },
          },
        });
      expect(byUser.get('a1')?.finishedAt).toBe(
        (await rowFor('a1')).submittedAt?.toISOString(),
      );
      expect(byUser.get('b1')?.finishedAt).toBe(
        (await rowFor('b1')).expiresAt.toISOString(),
      );
      expect(byUser.get('a3')?.finishedAt).toBeNull();
    });

    it("leaves out classes the quiz isn't assigned to", () => {
      expect(body.students.map((s) => s.username)).not.toContain('c1');
    });

    it('never shows correct answers or answer choices, only totals', async () => {
      const res = await results(quiz.id).expect(200);
      expect(res.text).not.toContain('isCorrect');
      expect(res.text).not.toContain('optionId');
      expect(res.text).not.toContain('pointsAwarded');
      // Only the listed student fields, never account data.
      expect(res.text).not.toContain('passwordHash');
      expect(res.text).not.toContain('not-used');
    });
  });

  it('keeps a student whose class was removed after they started', async () => {
    const quiz = await createQuiz(['10A']);
    await take(quiz, 'a1', [0, 0], true);
    await prisma.quizClass.updateMany({
      where: { quizId: quiz.id },
      data: { classId: classIds['10B'] },
    });

    const body = (await results(quiz.id).expect(200)).body as Results;
    expect(body.students.map((s) => [s.username, s.status])).toEqual([
      ['a1', 'SUBMITTED'],
      ['b1', 'NOT_STARTED'],
    ]);
    expect(body.summary.submitted).toBe(1);
  });

  it('has empty statistics when nobody has finished', async () => {
    const quiz = await createQuiz(['10B']);
    const body = (await results(quiz.id).expect(200)).body as Results;
    expect(body.summary).toEqual({
      students: 1,
      notStarted: 1,
      inProgress: 0,
      submitted: 0,
      expired: 0,
      scored: 0,
      average: null,
      highest: null,
      lowest: null,
    });
    expect(
      body.questions.map((q) => [q.correct, q.wrong, q.unanswered]),
    ).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });
});
