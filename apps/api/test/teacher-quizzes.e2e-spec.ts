import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers';

type OptionBody = {
  id: string;
  text: string;
  isCorrect: boolean;
  position: number;
};
type QuestionBody = {
  id: string;
  text: string;
  points: number;
  position: number;
  options: OptionBody[];
};
type QuizBody = {
  id: string;
  title: string;
  description: string | null;
  opensAt: string;
  closesAt: string;
  timeLimitMinutes: number;
  negativeMarkPercent: number;
  publishedAt: string | null;
  classes: { id: string; name: string }[];
  questions: QuestionBody[];
  attemptCount: number;
  isLocked: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number) =>
  new Date(Date.now() + days * DAY_MS).toISOString();
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const SAME_INSTANT = inDays(2);

describe('Teacher quiz management (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let class10A: string;
  let class10B: string;
  let teacherId: string;
  let studentId: string;
  let teacherToken: string;
  let otherTeacherToken: string;
  let studentToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const jwt = app.get(JwtService);

    class10A = (await prisma.class.create({ data: { name: '10A' } })).id;
    class10B = (await prisma.class.create({ data: { name: '10B' } })).id;
    const user = (username: string, role: 'TEACHER' | 'STUDENT') =>
      prisma.user.create({
        data: {
          username,
          fullName: username,
          passwordHash: 'not-used',
          role,
          classId: role === 'STUDENT' ? class10A : null,
        },
      });
    const teacher = await user('teacher1', 'TEACHER');
    const otherTeacher = await user('teacher2', 'TEACHER');
    const student = await user('student1', 'STUDENT');
    teacherId = teacher.id;
    studentId = student.id;
    // Same tokens login would issue (tested in auth.e2e-spec.ts), minus the bcrypt cost.
    teacherToken = jwt.sign({ sub: teacher.id });
    otherTeacherToken = jwt.sign({ sub: otherTeacher.id });
    studentToken = jwt.sign({ sub: student.id });
  });

  afterAll(async () => {
    await app.close();
  });

  const as = (token: string) => {
    const server = app.getHttpServer();
    const bearer = `Bearer ${token}`;
    return {
      get: (path: string) =>
        request(server).get(path).set('Authorization', bearer),
      post: (path: string, body?: object) =>
        request(server).post(path).set('Authorization', bearer).send(body),
      patch: (path: string, body: object) =>
        request(server).patch(path).set('Authorization', bearer).send(body),
      put: (path: string, body: object) =>
        request(server).put(path).set('Authorization', bearer).send(body),
      delete: (path: string) =>
        request(server).delete(path).set('Authorization', bearer),
    };
  };

  const validQuiz = (overrides: object = {}) => ({
    title: 'اختبار الرياضيات: المعادلات',
    description: 'اختبار قصير',
    opensAt: inDays(1),
    closesAt: inDays(8),
    timeLimitMinutes: 20,
    negativeMarkPercent: 25,
    classIds: [class10A],
    ...overrides,
  });

  const validQuestion = (overrides: object = {}) => ({
    text: 'ما قيمة س في المعادلة: 2س + 3 = 11؟',
    points: 2,
    options: [
      { text: '4', isCorrect: true },
      { text: '7', isCorrect: false },
      { text: '5.5', isCorrect: false },
      { text: '8', isCorrect: false },
    ],
    ...overrides,
  });

  async function createQuiz(overrides: object = {}, token = teacherToken) {
    const res = await as(token)
      .post('/teacher/quizzes', validQuiz(overrides))
      .expect(201);
    return res.body as QuizBody;
  }

  async function addQuestion(quizId: string, overrides: object = {}) {
    const res = await as(teacherToken)
      .post(`/teacher/quizzes/${quizId}/questions`, validQuestion(overrides))
      .expect(201);
    return res.body as QuizBody;
  }

  describe('access', () => {
    it('requires a login', async () => {
      await request(app.getHttpServer()).get('/teacher/quizzes').expect(401);
    });

    it('refuses students on every teacher route', async () => {
      const quiz = await createQuiz();
      const student = as(studentToken);
      await student.get('/teacher/quizzes').expect(403);
      await student.post('/teacher/quizzes', validQuiz()).expect(403);
      await student.get(`/teacher/quizzes/${quiz.id}`).expect(403);
      await student
        .patch(`/teacher/quizzes/${quiz.id}`, { title: 'hacked' })
        .expect(403);
      await student
        .post(`/teacher/quizzes/${quiz.id}/questions`, validQuestion())
        .expect(403);
      await student.post(`/teacher/quizzes/${quiz.id}/publish`).expect(403);
      await student.get('/classes').expect(403);
    });

    it('lists classes for teachers', async () => {
      const res = await as(teacherToken).get('/classes').expect(200);
      expect(res.body).toEqual([
        { id: class10A, name: '10A' },
        { id: class10B, name: '10B' },
      ]);
    });
  });

  describe('creating a quiz', () => {
    it('creates a draft owned by the caller, with Arabic text intact', async () => {
      const quiz = await createQuiz();

      expect(quiz).toMatchObject({
        title: 'اختبار الرياضيات: المعادلات',
        description: 'اختبار قصير',
        timeLimitMinutes: 20,
        negativeMarkPercent: 25,
        publishedAt: null,
        classes: [{ id: class10A, name: '10A' }],
        questions: [],
        attemptCount: 0,
        isLocked: false,
      });
      const stored = await prisma.quiz.findUniqueOrThrow({
        where: { id: quiz.id },
      });
      expect(stored.teacherId).toBe(teacherId);
    });

    it('turns negative marking off when it is not given', async () => {
      const body: Record<string, unknown> = validQuiz();
      delete body.negativeMarkPercent;
      const res = await as(teacherToken)
        .post('/teacher/quizzes', body)
        .expect(201);
      expect((res.body as QuizBody).negativeMarkPercent).toBe(0);
    });

    it('stores dates with a timezone offset as the correct instant', async () => {
      const quiz = await createQuiz({
        opensAt: '2030-10-01T09:00:00+03:00',
        closesAt: '2030-10-01T12:00:00+03:00',
      });
      expect(quiz.opensAt).toBe('2030-10-01T06:00:00.000Z');
      expect(quiz.closesAt).toBe('2030-10-01T09:00:00.000Z');
    });

    it.each([
      [
        'closesAt equal to opensAt',
        { opensAt: SAME_INSTANT, closesAt: SAME_INSTANT },
      ],
      ['closesAt before opensAt', { opensAt: inDays(3), closesAt: inDays(2) }],
      ['date without a timezone', { opensAt: '2030-10-01T09:00:00' }],
      ['impossible date', { opensAt: '2030-02-30T09:00:00Z' }],
      ['non-date text', { closesAt: 'next week' }],
      ['zero time limit', { timeLimitMinutes: 0 }],
      ['negative time limit', { timeLimitMinutes: -5 }],
      ['fractional time limit', { timeLimitMinutes: 2.5 }],
      ['time limit as a string', { timeLimitMinutes: '20' }],
      ['time limit over 300 minutes', { timeLimitMinutes: 301 }],
      ['negative marking below 0', { negativeMarkPercent: -1 }],
      ['negative marking above 100', { negativeMarkPercent: 101 }],
      ['fractional negative marking', { negativeMarkPercent: 12.5 }],
      ['no classes', { classIds: [] }],
      ['malformed class id', { classIds: ['10A'] }],
      ['class that does not exist', { classIds: [UNKNOWN_ID] }],
      ['empty title', { title: '' }],
      ['whitespace-only title', { title: '   ' }],
      ['title over 200 characters', { title: 'x'.repeat(201) }],
      ['a client-chosen owner', { teacherId: UNKNOWN_ID }],
      ['a client-set publish date', { publishedAt: inDays(0) }],
    ])('rejects %s', async (_case, overrides) => {
      await as(teacherToken)
        .post('/teacher/quizzes', validQuiz(overrides))
        .expect(400);
    });

    it('rejects duplicate class ids', async () => {
      await as(teacherToken)
        .post('/teacher/quizzes', validQuiz({ classIds: [class10A, class10A] }))
        .expect(400);
    });

    it('rejects a missing title', async () => {
      const body: Record<string, unknown> = validQuiz();
      delete body.title;
      await as(teacherToken).post('/teacher/quizzes', body).expect(400);
    });
  });

  describe('editing quiz settings', () => {
    it('updates title, negative marking, classes and clears the description', async () => {
      const quiz = await createQuiz();
      const res = await as(teacherToken)
        .patch(`/teacher/quizzes/${quiz.id}`, {
          title: 'عنوان جديد',
          negativeMarkPercent: 0,
          classIds: [class10B],
          description: null,
        })
        .expect(200);
      expect(res.body).toMatchObject({
        title: 'عنوان جديد',
        negativeMarkPercent: 0,
        classes: [{ id: class10B, name: '10B' }],
        description: null,
      });
    });

    it.each([
      ['closesAt before the current opensAt', { closesAt: inDays(0.5) }],
      ['a null title', { title: null }],
      ['a null time limit', { timeLimitMinutes: null }],
      ['no classes', { classIds: [] }],
      ['time limit as a string', { timeLimitMinutes: '30' }],
      ['a client-chosen owner', { teacherId: UNKNOWN_ID }],
      ['a client-set publish date', { publishedAt: inDays(0) }],
    ])('rejects %s', async (_case, body) => {
      const quiz = await createQuiz(); // opens in 1 day
      await as(teacherToken)
        .patch(`/teacher/quizzes/${quiz.id}`, body)
        .expect(400);
    });

    it('rejects malformed quiz ids', async () => {
      await as(teacherToken).get('/teacher/quizzes/not-a-uuid').expect(400);
    });

    it('returns 404 for a quiz that does not exist', async () => {
      await as(teacherToken).get(`/teacher/quizzes/${UNKNOWN_ID}`).expect(404);
    });
  });

  describe('questions and options', () => {
    it('adds questions with their options, in order', async () => {
      const quiz = await createQuiz();
      await addQuestion(quiz.id);
      const updated = await addQuestion(quiz.id, {
        text: 'سؤال ثان',
        points: 3,
      });

      expect(
        updated.questions.map((q) => [q.text, q.points, q.position]),
      ).toEqual([
        ['ما قيمة س في المعادلة: 2س + 3 = 11؟', 2, 1],
        ['سؤال ثان', 3, 2],
      ]);
      expect(updated.questions[0].options).toEqual([
        expect.objectContaining({ text: '4', isCorrect: true, position: 1 }),
        expect.objectContaining({ text: '7', isCorrect: false, position: 2 }),
        expect.objectContaining({ text: '5.5', isCorrect: false, position: 3 }),
        expect.objectContaining({ text: '8', isCorrect: false, position: 4 }),
      ]);
    });

    it('replaces a question, including its options and correct answer', async () => {
      const quiz = await addQuestion((await createQuiz()).id);
      const question = quiz.questions[0];

      const res = await as(teacherToken)
        .put(`/teacher/quizzes/${quiz.id}/questions/${question.id}`, {
          text: 'ما حل المعادلة: 5س − 10 = 0؟',
          points: 1,
          options: [
            { text: '5', isCorrect: false },
            { text: '2', isCorrect: true },
            { text: '−2', isCorrect: false },
          ],
        })
        .expect(200);

      const replaced = (res.body as QuizBody).questions[0];
      expect(replaced).toMatchObject({
        id: question.id,
        text: 'ما حل المعادلة: 5س − 10 = 0؟',
        points: 1,
        position: 1,
      });
      expect(replaced.options.map((o) => [o.text, o.isCorrect])).toEqual([
        ['5', false],
        ['2', true],
        ['−2', false],
      ]);
      const oldOptions = await prisma.option.count({
        where: { id: { in: question.options.map((o) => o.id) } },
      });
      expect(oldOptions).toBe(0);
    });

    it('removes a question together with its options', async () => {
      const quiz = await addQuestion((await createQuiz()).id);
      const question = quiz.questions[0];

      const res = await as(teacherToken)
        .delete(`/teacher/quizzes/${quiz.id}/questions/${question.id}`)
        .expect(200);
      expect((res.body as QuizBody).questions).toEqual([]);
      expect(
        await prisma.option.count({ where: { questionId: question.id } }),
      ).toBe(0);
    });

    const options = (...correct: boolean[]) =>
      correct.map((isCorrect, i) => ({ text: `option ${i}`, isCorrect }));

    it.each([
      ['no correct option', { options: options(false, false, false, false) }],
      ['two correct options', { options: options(true, true, false, false) }],
      ['a single option', { options: options(true) }],
      [
        'seven options',
        { options: options(true, false, false, false, false, false, false) },
      ],
      ['no options', { options: [] }],
      ['zero points', { points: 0 }],
      ['101 points', { points: 101 }],
      ['fractional points', { points: 1.5 }],
      ['empty question text', { text: '  ' }],
      [
        'duplicate option texts',
        {
          options: [
            { text: 'نعم', isCorrect: true },
            { text: 'نعم', isCorrect: false },
          ],
        },
      ],
      [
        'an empty option text',
        {
          options: [
            { text: 'yes', isCorrect: true },
            { text: ' ', isCorrect: false },
          ],
        },
      ],
      [
        'isCorrect as a string',
        {
          options: [
            { text: 'yes', isCorrect: 'true' },
            { text: 'no', isCorrect: false },
          ],
        },
      ],
      [
        'an option missing isCorrect',
        { options: [{ text: 'yes', isCorrect: true }, { text: 'no' }] },
      ],
      [
        'an unknown field on an option',
        {
          options: [
            { text: 'yes', isCorrect: true, id: UNKNOWN_ID },
            { text: 'no', isCorrect: false },
          ],
        },
      ],
    ])('rejects a question with %s', async (_case, overrides) => {
      const quiz = await createQuiz();
      await as(teacherToken)
        .post(`/teacher/quizzes/${quiz.id}/questions`, validQuestion(overrides))
        .expect(400);
      expect(await prisma.question.count({ where: { quizId: quiz.id } })).toBe(
        0,
      );
    });

    it("won't edit or delete a question through a different quiz's URL", async () => {
      const quizA = await createQuiz();
      const quizB = await addQuestion((await createQuiz()).id);
      const questionOfB = quizB.questions[0];

      await as(teacherToken)
        .put(
          `/teacher/quizzes/${quizA.id}/questions/${questionOfB.id}`,
          validQuestion({ text: 'changed' }),
        )
        .expect(404);
      await as(teacherToken)
        .delete(`/teacher/quizzes/${quizA.id}/questions/${questionOfB.id}`)
        .expect(404);

      const stored = await prisma.question.findUniqueOrThrow({
        where: { id: questionOfB.id },
      });
      expect(stored.text).toBe(questionOfB.text);
    });

    it('returns 404 for a question that does not exist, 400 for a malformed id', async () => {
      const quiz = await createQuiz();
      await as(teacherToken)
        .put(
          `/teacher/quizzes/${quiz.id}/questions/${UNKNOWN_ID}`,
          validQuestion(),
        )
        .expect(404);
      await as(teacherToken)
        .delete(`/teacher/quizzes/${quiz.id}/questions/not-a-uuid`)
        .expect(400);
    });
  });

  describe('publishing', () => {
    it('refuses a quiz with no questions', async () => {
      const quiz = await createQuiz();
      const res = await as(teacherToken)
        .post(`/teacher/quizzes/${quiz.id}/publish`)
        .expect(409);
      expect(res.body).toMatchObject({
        message: ['Add at least one question'],
      });
    });

    it('refuses a quiz whose closing date has passed', async () => {
      const quiz = await addQuestion(
        (await createQuiz({ opensAt: inDays(-10), closesAt: inDays(-1) })).id,
      );
      const res = await as(teacherToken)
        .post(`/teacher/quizzes/${quiz.id}/publish`)
        .expect(409);
      expect(res.body).toMatchObject({
        message: ['The closing date has already passed'],
      });
    });

    it('publishes a complete quiz, and publishing again changes nothing', async () => {
      const quiz = await addQuestion((await createQuiz()).id);
      const first = await as(teacherToken)
        .post(`/teacher/quizzes/${quiz.id}/publish`)
        .expect(200);
      const publishedAt = (first.body as QuizBody).publishedAt;
      expect(publishedAt).not.toBeNull();

      const second = await as(teacherToken)
        .post(`/teacher/quizzes/${quiz.id}/publish`)
        .expect(200);
      expect((second.body as QuizBody).publishedAt).toBe(publishedAt);
    });

    it('keeps at least one question on a published quiz', async () => {
      const quiz = await addQuestion((await createQuiz()).id);
      await as(teacherToken)
        .post(`/teacher/quizzes/${quiz.id}/publish`)
        .expect(200);

      await as(teacherToken)
        .delete(`/teacher/quizzes/${quiz.id}/questions/${quiz.questions[0].id}`)
        .expect(409);
      // Before anyone starts, a published quiz can still be edited.
      await addQuestion(quiz.id, { text: 'another question' });
    });
  });

  describe("another teacher's quiz", () => {
    it('is invisible and unchangeable (404, not 403)', async () => {
      const quiz = await addQuestion((await createQuiz()).id);
      const questionId = quiz.questions[0].id;
      const other = as(otherTeacherToken);

      await other.get(`/teacher/quizzes/${quiz.id}`).expect(404);
      await other
        .patch(`/teacher/quizzes/${quiz.id}`, { title: 'hijacked' })
        .expect(404);
      await other
        .post(`/teacher/quizzes/${quiz.id}/questions`, validQuestion())
        .expect(404);
      await other
        .put(
          `/teacher/quizzes/${quiz.id}/questions/${questionId}`,
          validQuestion({ text: 'hijacked' }),
        )
        .expect(404);
      await other
        .delete(`/teacher/quizzes/${quiz.id}/questions/${questionId}`)
        .expect(404);
      await other.post(`/teacher/quizzes/${quiz.id}/publish`).expect(404);

      const listed = (await other.get('/teacher/quizzes').expect(200)).body as {
        id: string;
      }[];
      expect(listed.map((q) => q.id)).not.toContain(quiz.id);

      const stored = await prisma.quiz.findUniqueOrThrow({
        where: { id: quiz.id },
        include: { questions: true },
      });
      expect(stored.title).toBe(quiz.title);
      expect(stored.publishedAt).toBeNull();
      expect(stored.questions.map((q) => q.text)).toEqual([
        quiz.questions[0].text,
      ]);
    });
  });

  describe('after a student has started the quiz', () => {
    let quiz: QuizBody;

    beforeEach(async () => {
      quiz = await addQuestion((await createQuiz({ opensAt: inDays(-1) })).id);
      await as(teacherToken)
        .post(`/teacher/quizzes/${quiz.id}/publish`)
        .expect(200);
      await prisma.quizAttempt.create({
        data: {
          quizId: quiz.id,
          studentId,
          expiresAt: new Date(Date.now() + 20 * 60 * 1000),
        },
      });
    });

    it('locks questions, options and points', async () => {
      const questionId = quiz.questions[0].id;
      await as(teacherToken)
        .post(`/teacher/quizzes/${quiz.id}/questions`, validQuestion())
        .expect(409);
      await as(teacherToken)
        .put(
          `/teacher/quizzes/${quiz.id}/questions/${questionId}`,
          validQuestion({ points: 10 }),
        )
        .expect(409);
      await as(teacherToken)
        .delete(`/teacher/quizzes/${quiz.id}/questions/${questionId}`)
        .expect(409);
    });

    it('locks the time limit and negative marking', async () => {
      await as(teacherToken)
        .patch(`/teacher/quizzes/${quiz.id}`, { timeLimitMinutes: 60 })
        .expect(409);
      await as(teacherToken)
        .patch(`/teacher/quizzes/${quiz.id}`, { negativeMarkPercent: 0 })
        .expect(409);

      const stored = await prisma.quiz.findUniqueOrThrow({
        where: { id: quiz.id },
      });
      expect(stored.timeLimitMinutes).toBe(20);
      expect(stored.negativeMarkPercent).toBe(25);
    });

    it('still allows the title and closing date to change', async () => {
      const res = await as(teacherToken)
        .patch(`/teacher/quizzes/${quiz.id}`, {
          title: 'renamed',
          closesAt: inDays(20),
          timeLimitMinutes: 20, // unchanged value: not a change, so allowed
        })
        .expect(200);
      expect(res.body).toMatchObject({
        title: 'renamed',
        attemptCount: 1,
        isLocked: true,
      });
    });
  });

  describe('listing', () => {
    it("shows the teacher's own quizzes with question and attempt counts", async () => {
      const mine = await addQuestion((await createQuiz({ title: 'mine' })).id);
      const theirs = await createQuiz({ title: 'theirs' }, otherTeacherToken);

      const res = await as(teacherToken).get('/teacher/quizzes').expect(200);
      const list = res.body as {
        id: string;
        questionCount: number;
        attemptCount: number;
      }[];
      expect(list.map((q) => q.id)).not.toContain(theirs.id);
      expect(list.find((q) => q.id === mine.id)).toMatchObject({
        questionCount: 1,
        attemptCount: 0,
      });
    });
  });
});
