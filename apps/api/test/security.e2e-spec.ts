import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers';

// Phase 12: trying to break the API directly, the way someone skipping the web app would.
// Each describe block is one item from the brief's list. Many rules also have detailed tests
// in the other suites; this file checks them together from an attacker's point of view.

const MINUTE_MS = 60 * 1000;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

describe('Security & edge cases (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let users: Record<string, { id: string; token: string }>;
  let classId: string;
  // teacher1's published quiz (and its questions/options), and teacher2's quiz.
  let quiz: { id: string; questions: { id: string; optionIds: string[] }[] };
  let otherQuiz: {
    id: string;
    questions: { id: string; optionIds: string[] }[];
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    jwt = app.get(JwtService);
    classId = (await prisma.class.create({ data: { name: '10A' } })).id;
    users = {};
    for (const [username, role] of [
      ['teacher1', 'TEACHER'],
      ['teacher2', 'TEACHER'],
      ['student1', 'STUDENT'],
      ['student2', 'STUDENT'],
    ] as const) {
      const user = await prisma.user.create({
        data: {
          username,
          fullName: username,
          passwordHash: 'not-used',
          role,
          classId: role === 'STUDENT' ? classId : null,
        },
      });
      users[username] = { id: user.id, token: jwt.sign({ sub: user.id }) };
    }
    quiz = await createQuiz(users.teacher1.id);
    otherQuiz = await createQuiz(users.teacher2.id);
  });

  afterAll(async () => {
    await app.close();
  });

  // A published, open quiz for 10A: two questions worth 2 and 3 points, option 0 correct.
  async function createQuiz(teacherId: string) {
    const created = await prisma.quiz.create({
      data: {
        title: 'اختبار',
        teacherId,
        opensAt: new Date(Date.now() - 60 * MINUTE_MS),
        closesAt: new Date(Date.now() + 24 * 60 * MINUTE_MS),
        timeLimitMinutes: 20,
        negativeMarkPercent: 25,
        publishedAt: new Date(Date.now() - 120 * MINUTE_MS),
        classes: { create: [{ classId }] },
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
    return {
      id: created.id,
      questions: created.questions.map((q) => ({
        id: q.id,
        optionIds: q.options.map((o) => o.id),
      })),
    };
  }

  const call = (method: Method, path: string, token?: string) => {
    const req = request(app.getHttpServer())[method](path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const as = (username: string) => users[username].token;

  // Every protected route, with realistic ids, grouped by the role allowed to use it.
  const teacherRoutes = (): [Method, string][] => {
    const q = quiz.questions[0].id;
    return [
      ['get', '/classes'],
      ['get', '/teacher/quizzes'],
      ['post', '/teacher/quizzes'],
      ['get', `/teacher/quizzes/${quiz.id}`],
      ['patch', `/teacher/quizzes/${quiz.id}`],
      ['post', `/teacher/quizzes/${quiz.id}/publish`],
      ['post', `/teacher/quizzes/${quiz.id}/questions`],
      ['put', `/teacher/quizzes/${quiz.id}/questions/${q}`],
      ['delete', `/teacher/quizzes/${quiz.id}/questions/${q}`],
      ['get', `/teacher/quizzes/${quiz.id}/results`],
    ];
  };
  const studentRoutes = (): [Method, string][] => {
    const base = `/student/quizzes/${quiz.id}/attempt`;
    const q = quiz.questions[0].id;
    return [
      ['get', '/student/quizzes'],
      ['get', `/student/quizzes/${quiz.id}`],
      ['post', base],
      ['get', base],
      ['put', `${base}/answers/${q}`],
      ['delete', `${base}/answers/${q}`],
      ['post', `${base}/submit`],
    ];
  };

  describe('unauthorized API requests', () => {
    it('refuses every protected route without a token', async () => {
      for (const [method, path] of [
        ['get', '/auth/me'] as [Method, string],
        ...teacherRoutes(),
        ...studentRoutes(),
      ]) {
        const res = await call(method, path);
        expect([method, path, res.status]).toEqual([method, path, 401]);
      }
      expect(await prisma.quizAttempt.count()).toBe(0);
    });

    it('refuses an expired token and a token for a deleted account', async () => {
      const expired = jwt.sign({ sub: users.student1.id }, { expiresIn: -60 });
      await call('get', '/student/quizzes', expired).expect(401);

      const gone = await prisma.user.create({
        data: {
          username: 'gone',
          fullName: 'gone',
          passwordHash: 'x',
          role: 'STUDENT',
          classId,
        },
      });
      const token = jwt.sign({ sub: gone.id });
      await prisma.user.delete({ where: { id: gone.id } });
      await call('get', '/student/quizzes', token).expect(401);
    });

    it('does not let another website call the API from a browser (no CORS)', async () => {
      const res = await call('get', '/student/quizzes', as('student1'))
        .set('Origin', 'https://evil.example')
        .expect(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('wrong roles', () => {
    it('refuses every teacher route to a student, and every student route to a teacher', async () => {
      for (const [method, path] of teacherRoutes()) {
        const res = await call(method, path, as('student1'));
        expect([method, path, res.status]).toEqual([method, path, 403]);
      }
      for (const [method, path] of studentRoutes()) {
        const res = await call(method, path, as('teacher1'));
        expect([method, path, res.status]).toEqual([method, path, 403]);
      }
      expect(await prisma.quizAttempt.count()).toBe(0);
    });
  });

  describe("another student's results", () => {
    it("can't be read, changed or submitted by a classmate", async () => {
      const base = `/student/quizzes/${quiz.id}/attempt`;
      const [q1] = quiz.questions;
      await call('post', base, as('student1')).expect(200);
      await call('put', `${base}/answers/${q1.id}`, as('student1'))
        .send({ optionId: q1.optionIds[0] })
        .expect(200);
      await call('post', `${base}/submit`, as('student1')).expect(200);

      // student2 has no attempt of their own: everything about the quiz's attempt is 404,
      // and nothing in their own views mentions student1's score.
      await call('get', base, as('student2')).expect(404);
      await call('post', `${base}/submit`, as('student2')).expect(404);
      const detail = await call(
        'get',
        `/student/quizzes/${quiz.id}`,
        as('student2'),
      ).expect(200);
      expect(detail.body).toMatchObject({ state: 'AVAILABLE', score: null });
      const list = await call('get', '/student/quizzes', as('student2')).expect(
        200,
      );
      const listed = (list.body as { id: string }[]).find(
        (q) => q.id === quiz.id,
      );
      expect(listed).toMatchObject({
        state: 'AVAILABLE',
        score: null,
        maxScore: null,
      });
    });

    it("can't be read by a teacher who doesn't own the quiz", async () => {
      await call(
        'get',
        `/teacher/quizzes/${quiz.id}/results`,
        as('teacher2'),
      ).expect(404);
      await call('get', `/teacher/quizzes/${quiz.id}`, as('teacher2')).expect(
        404,
      );
    });
  });

  describe("modifying another teacher's quiz", () => {
    it('is refused on every change route (404), and nothing changes', async () => {
      const [q1] = otherQuiz.questions;
      // A quiz of teacher1 with no attempts, so its own lock (409) can't answer first.
      const own = await createQuiz(users.teacher1.id);
      const before = await prisma.quiz.findUniqueOrThrow({
        where: { id: otherQuiz.id },
        include: { questions: { include: { options: true } }, classes: true },
      });
      const question = {
        text: 'hacked',
        points: 1,
        options: [
          { text: 'a', isCorrect: true },
          { text: 'b', isCorrect: false },
        ],
      };
      const changes: [Method, string, object][] = [
        ['patch', `/teacher/quizzes/${otherQuiz.id}`, { title: 'hacked' }],
        ['post', `/teacher/quizzes/${otherQuiz.id}/publish`, {}],
        ['post', `/teacher/quizzes/${otherQuiz.id}/questions`, question],
        [
          'put',
          `/teacher/quizzes/${otherQuiz.id}/questions/${q1.id}`,
          question,
        ],
        ['delete', `/teacher/quizzes/${otherQuiz.id}/questions/${q1.id}`, {}],
        // teacher1's own quiz id in the URL, teacher2's question id: still refused.
        ['put', `/teacher/quizzes/${own.id}/questions/${q1.id}`, question],
        ['delete', `/teacher/quizzes/${own.id}/questions/${q1.id}`, {}],
      ];
      for (const [method, path, body] of changes) {
        const res = await call(method, path, as('teacher1')).send(body);
        expect([method, path, res.status]).toEqual([method, path, 404]);
      }

      const after = await prisma.quiz.findUniqueOrThrow({
        where: { id: otherQuiz.id },
        include: { questions: { include: { options: true } }, classes: true },
      });
      expect(after).toEqual(before);
    });

    it('answers 404, never 409, even when the quiz is locked or not ready to publish', async () => {
      // A 409 would reveal that the quiz exists and what state it is in.
      const locked = await createQuiz(users.teacher2.id);
      await call(
        'post',
        `/student/quizzes/${locked.id}/attempt`,
        as('student1'),
      ).expect(200);
      const [q1] = locked.questions;
      const question = {
        text: 'q',
        points: 1,
        options: [
          { text: 'a', isCorrect: true },
          { text: 'b', isCorrect: false },
        ],
      };
      const attempts: [Method, string, object][] = [
        ['patch', `/teacher/quizzes/${locked.id}`, { timeLimitMinutes: 99 }],
        ['post', `/teacher/quizzes/${locked.id}/questions`, question],
        ['put', `/teacher/quizzes/${locked.id}/questions/${q1.id}`, question],
        ['delete', `/teacher/quizzes/${locked.id}/questions/${q1.id}`, {}],
      ];
      for (const [method, path, body] of attempts) {
        const res = await call(method, path, as('teacher1')).send(body);
        expect([method, path, res.status]).toEqual([method, path, 404]);
      }

      // A draft of teacher2's with no questions: publishing would be a 409 for its owner.
      const draft = await prisma.quiz.create({
        data: {
          title: 'draft',
          teacherId: users.teacher2.id,
          opensAt: new Date(Date.now() + 60 * MINUTE_MS),
          closesAt: new Date(Date.now() + 120 * MINUTE_MS),
          timeLimitMinutes: 20,
        },
      });
      await call(
        'post',
        `/teacher/quizzes/${draft.id}/publish`,
        as('teacher1'),
      ).expect(404);
      await call(
        'post',
        `/teacher/quizzes/${draft.id}/publish`,
        as('teacher2'),
      ).expect(409);
    });

    it("can't take over a quiz by sending teacherId", async () => {
      await call('patch', `/teacher/quizzes/${quiz.id}`, as('teacher1'))
        .send({ teacherId: users.teacher2.id })
        .expect(400);
      const row = await prisma.quiz.findUniqueOrThrow({
        where: { id: quiz.id },
      });
      expect(row.teacherId).toBe(users.teacher1.id);
    });
  });

  describe('attempts, time and score', () => {
    // A fresh quiz per test, so attempts don't interfere.
    let fresh: typeof quiz;
    const base = () => `/student/quizzes/${fresh.id}/attempt`;
    beforeEach(async () => {
      fresh = await createQuiz(users.teacher1.id);
    });

    async function runOutOfTime(studentId: string) {
      const attempt = await prisma.quizAttempt.findUniqueOrThrow({
        where: { quizId_studentId: { quizId: fresh.id, studentId } },
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

    it('refuses to submit after expiry, even with a client-sent time', async () => {
      await call('post', base(), as('student1')).expect(200);
      await runOutOfTime(users.student1.id);
      await call('post', `${base()}/submit`, as('student1'))
        .send({
          submittedAt: new Date(Date.now() - 30 * MINUTE_MS).toISOString(),
        })
        .expect(409);
      const row = await prisma.quizAttempt.findFirstOrThrow({
        where: { quizId: fresh.id },
      });
      expect([row.status, row.submittedAt]).toEqual(['EXPIRED', null]);
    });

    it('never gives a second attempt', async () => {
      await call('post', base(), as('student1')).expect(200);
      await call('post', `${base()}/submit`, as('student1')).expect(200);
      await call('post', base(), as('student1')).expect(409);
      expect(
        await prisma.quizAttempt.count({ where: { quizId: fresh.id } }),
      ).toBe(1);
    });

    it('ignores a score sent by the client, and refuses one sent with an answer', async () => {
      const [q1, q2] = fresh.questions;
      await call('post', base(), as('student1')).expect(200);
      await call('put', `${base()}/answers/${q1.id}`, as('student1'))
        .send({ optionId: q1.optionIds[1], pointsAwarded: 2 })
        .expect(400);
      await call('put', `${base()}/answers/${q2.id}`, as('student1'))
        .send({ optionId: q2.optionIds[1] })
        .expect(200);
      const res = await call('post', `${base()}/submit`, as('student1'))
        .send({ score: 5, maxScore: 5 })
        .expect(200);
      expect(res.body).toMatchObject({ score: 0, maxScore: 5 }); // −25% of 3, floored at 0
    });

    it("refuses another quiz's question, another question's option and made-up ids", async () => {
      const [q1, q2] = fresh.questions;
      await call('post', base(), as('student1')).expect(200);
      const otherQ = otherQuiz.questions[0];
      await call('put', `${base()}/answers/${otherQ.id}`, as('student1'))
        .send({ optionId: otherQ.optionIds[0] })
        .expect(404);
      await call('put', `${base()}/answers/${q1.id}`, as('student1'))
        .send({ optionId: q2.optionIds[0] })
        .expect(400);
      await call('put', `${base()}/answers/${q1.id}`, as('student1'))
        .send({ optionId: otherQ.optionIds[0] })
        .expect(400);
      await call('put', `${base()}/answers/${q1.id}`, as('student1'))
        .send({ optionId: UNKNOWN_ID })
        .expect(400);
      await call('put', `${base()}/answers/${UNKNOWN_ID}`, as('student1'))
        .send({ optionId: q1.optionIds[0] })
        .expect(404);
      await call('put', `${base()}/answers/${q1.id}`, as('student1'))
        .send({ optionId: 'not-a-uuid' })
        .expect(400);
      expect(
        await prisma.answer.count({ where: { attempt: { quizId: fresh.id } } }),
      ).toBe(0);
    });
  });

  describe('password guessing', () => {
    it('slows down repeated wrong passwords for one username, even the right one', async () => {
      await prisma.user.create({
        data: {
          username: 'throttled',
          fullName: 'throttled',
          passwordHash: await bcrypt.hash('Right-Pass-1', 4),
          role: 'STUDENT',
          classId,
        },
      });
      const login = (username: string, password: string) =>
        call('post', '/auth/login').send({ username, password });

      for (let i = 0; i < 5; i++) {
        await login('throttled', `wrong-${i}`).expect(401);
      }
      const blocked = await login('throttled', 'wrong-again').expect(429);
      expect(blocked.body).toMatchObject({
        message: 'Too many login attempts. Try again later.',
        retryAfterSeconds: 1,
      });
      // Until the wait is over, even the right password is not checked.
      await login('throttled', 'Right-Pass-1').expect(429);
      // Other accounts are not affected.
      await login('student2', 'wrong').expect(401);

      await new Promise((resolve) => setTimeout(resolve, 1100));
      await login('throttled', 'Right-Pass-1').expect(200);
      // A successful login clears the count: without that, the second of these would be 429.
      await login('throttled', 'wrong-after-1').expect(401);
      await login('throttled', 'wrong-after-2').expect(401);
    });

    it("throttles unknown usernames the same way, so the limit doesn't reveal which exist", async () => {
      const login = (username: string, password: string) =>
        call('post', '/auth/login').send({ username, password });
      for (let i = 0; i < 5; i++) {
        await login('no-such-user', `guess-${i}`).expect(401);
      }
      const blocked = await login('no-such-user', 'guess-again').expect(429);
      expect(blocked.body).toMatchObject({
        message: 'Too many login attempts. Try again later.',
      });
      // The username is normalised first, so case and spaces don't give a fresh count.
      await login('  NO-SUCH-USER ', 'guess-more').expect(429);
    });
  });

  describe('malformed requests and missing fields', () => {
    it('answers invalid JSON with 400, not a server error', async () => {
      const res = await call('post', '/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"username": "student1", "password": ');
      expect(res.status).toBe(400);
    });

    it('answers a body of the wrong shape with 400', async () => {
      for (const body of [[], ['x'], 'text', 42, null]) {
        const res = await call('post', '/teacher/quizzes', as('teacher1'))
          .set('Content-Type', 'application/json')
          .send(JSON.stringify(body));
        expect([JSON.stringify(body), res.status]).toEqual([
          JSON.stringify(body),
          400,
        ]);
      }
    });

    it('answers a date the validator accepts but JavaScript cannot read with 400', async () => {
      // ISO week and ordinal dates are valid ISO 8601, but new Date() can't parse them.
      const own = await createQuiz(users.teacher1.id);
      for (const closesAt of [
        '2026-W40-4T09:00:00Z',
        '2026-274T09:00:00Z',
        '2026-10-01T09Z',
        '2026-10-01T09:00:00,5Z',
        '+2026-10-01T09:00:00Z',
        // Valid, but the year 10000 in UTC: stored, then unreadable.
        '9999-12-31T23:00:00-03:00',
      ]) {
        const res = await call(
          'patch',
          `/teacher/quizzes/${own.id}`,
          as('teacher1'),
        ).send({
          closesAt,
        });
        expect([closesAt, res.status]).toEqual([closesAt, 400]);
      }
    });

    it('answers a NUL character in text with 400, not a database error', async () => {
      // Postgres text can't hold \u0000; it must be refused before it reaches the database.
      await call('post', '/auth/login')
        .send({ username: 'a\u0000b', password: 'x' })
        .expect(400);
      const own = await createQuiz(users.teacher1.id);
      await call('patch', `/teacher/quizzes/${own.id}`, as('teacher1'))
        .send({ title: 'Quiz\u0000' })
        .expect(400);
      await call('patch', `/teacher/quizzes/${own.id}`, as('teacher1'))
        .send({ description: 'a\u0000' })
        .expect(400);
      const q = own.questions[0];
      for (const question of [
        {
          text: 'q\u0000',
          points: 1,
          options: [
            { text: 'a', isCorrect: true },
            { text: 'b', isCorrect: false },
          ],
        },
        {
          text: 'q',
          points: 1,
          options: [
            { text: 'a\u0000', isCorrect: true },
            { text: 'b', isCorrect: false },
          ],
        },
      ]) {
        await call(
          'put',
          `/teacher/quizzes/${own.id}/questions/${q.id}`,
          as('teacher1'),
        )
          .send(question)
          .expect(400);
      }
    });

    it('answers missing and wrongly typed fields with 400', async () => {
      await call('post', '/auth/login')
        .send({ username: 'student1' })
        .expect(400);
      await call('post', '/auth/login')
        .send({ username: 1, password: 2 })
        .expect(400);
      await call('post', '/teacher/quizzes', as('teacher1'))
        .send({ title: 'no dates or classes' })
        .expect(400);
      await call('post', '/teacher/quizzes', as('teacher1'))
        .send({
          title: 'wrong types',
          opensAt: 'tomorrow',
          closesAt: 5,
          timeLimitMinutes: '20',
          classIds: 'all',
        })
        .expect(400);
    });

    it('drops prototype-pollution keys (__proto__, constructor) without applying them', async () => {
      // class-transformer skips these two keys before validation, so they never reach the
      // DTO or the database, and no object prototype is touched.
      const own = await createQuiz(users.teacher1.id);
      await call('patch', `/teacher/quizzes/${own.id}`, as('teacher1'))
        .set('Content-Type', 'application/json')
        .send(
          '{"title": "renamed", "__proto__": {"isAdmin": true}, "constructor": {"prototype": {"isAdmin": true}}}',
        )
        .expect(200);
      expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
      const row = await prisma.quiz.findUniqueOrThrow({
        where: { id: own.id },
      });
      expect(row.title).toBe('renamed');
      expect(row.teacherId).toBe(users.teacher1.id);
    });

    it('never answers with a stack trace or database details', async () => {
      const res = await call('post', '/auth/login')
        .set('Content-Type', 'application/json')
        .send('{broken');
      expect(res.text).not.toMatch(/at \w+ \(|node_modules|prisma|SELECT /i);
    });
  });
});
