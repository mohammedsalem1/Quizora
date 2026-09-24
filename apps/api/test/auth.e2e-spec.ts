import { Controller, Get, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Roles } from '../src/auth/decorators';
import { PrismaService } from '../src/prisma/prisma.service';

// Test-only routes, so role checks can be tested before the real teacher/student
// endpoints exist. The app's global guards apply to them exactly as to real routes.
@Controller('test-roles')
class RoleProbeController {
  @Roles('TEACHER')
  @Get('teacher')
  teacher() {
    return { ok: true };
  }

  @Roles('STUDENT')
  @Get('student')
  student() {
    return { ok: true };
  }

  @Get('any-role')
  anyRole() {
    return { ok: true };
  }
}

const PASSWORD = 'correct-horse-battery';

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('Authentication & roles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let studentId: string;
  let teacherId: string;
  let classId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [RoleProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);

    // Belt and braces on top of test/setup-env.ts: never wipe a non-test database.
    const [{ db }] = await prisma.$queryRaw<
      { db: string }[]
    >`SELECT current_database() AS db`;
    if (!db.endsWith('_test')) {
      throw new Error(`Refusing to wipe non-test database "${db}"`);
    }

    await prisma.answer.deleteMany();
    await prisma.quizAttempt.deleteMany();
    await prisma.quizClass.deleteMany();
    await prisma.option.deleteMany();
    await prisma.question.deleteMany();
    await prisma.quiz.deleteMany();
    await prisma.user.deleteMany();
    await prisma.class.deleteMany();

    const passwordHash = await bcrypt.hash(PASSWORD, 4); // low cost: tests only
    classId = (await prisma.class.create({ data: { name: '10A' } })).id;
    studentId = (
      await prisma.user.create({
        data: {
          username: 'student1',
          fullName: 'ليان حداد',
          passwordHash,
          role: 'STUDENT',
          classId,
        },
      })
    ).id;
    teacherId = (
      await prisma.user.create({
        data: {
          username: 'teacher1',
          fullName: 'رنا الخطيب',
          passwordHash,
          role: 'TEACHER',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (body: object) =>
    request(app.getHttpServer()).post('/auth/login').send(body);

  const getWithToken = (path: string, token: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`);

  async function tokenFor(username: string): Promise<string> {
    const res = await login({ username, password: PASSWORD }).expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  describe('POST /auth/login', () => {
    it('returns a token and the profile, but never the password hash', async () => {
      const res = await login({
        username: 'student1',
        password: PASSWORD,
      }).expect(200);
      const body = res.body as { accessToken: unknown; user: unknown };

      expect(typeof body.accessToken).toBe('string');
      expect(body.user).toEqual({
        id: studentId,
        username: 'student1',
        fullName: 'ليان حداد',
        role: 'STUDENT',
        class: { id: classId, name: '10A' },
      });
      expect(res.text).not.toContain('passwordHash');
      expect(res.text).not.toContain('$2'); // no bcrypt hash anywhere in the body
    });

    it('ignores username case and surrounding spaces', async () => {
      await login({ username: '  Student1 ', password: PASSWORD }).expect(200);
    });

    it('does not ignore password case', async () => {
      await login({
        username: 'student1',
        password: PASSWORD.toUpperCase(),
      }).expect(401);
    });

    it('gives the same answer for a wrong password and an unknown username', async () => {
      const wrongPassword = await login({
        username: 'student1',
        password: 'wrong',
      }).expect(401);
      const unknownUser = await login({
        username: 'nobody',
        password: PASSWORD,
      }).expect(401);
      expect(wrongPassword.body).toEqual(unknownUser.body);
    });

    it.each([
      ['missing password', { username: 'student1' }],
      ['missing username', { password: PASSWORD }],
      ['empty username', { username: '', password: PASSWORD }],
      ['non-string password', { username: 'student1', password: 12345 }],
      ['empty body', {}],
    ])('rejects malformed input: %s', async (_case, body) => {
      await login(body).expect(400);
    });

    it('rejects a client-supplied role instead of trusting it', async () => {
      await login({
        username: 'student1',
        password: PASSWORD,
        role: 'TEACHER',
      }).expect(400);
    });
  });

  describe('protected routes', () => {
    it('GET /auth/me returns the logged-in user', async () => {
      const token = await tokenFor('teacher1');
      const res = await getWithToken('/auth/me', token).expect(200);
      expect(res.body).toEqual({
        id: teacherId,
        username: 'teacher1',
        fullName: 'رنا الخطيب',
        role: 'TEACHER',
        class: null,
      });
    });

    it('rejects a request with no token', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('rejects a token sent without the Bearer scheme', async () => {
      const token = await tokenFor('student1');
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', token)
        .expect(401);
    });

    it('rejects a garbage token', async () => {
      await getWithToken('/auth/me', 'not.a.jwt').expect(401);
    });

    it('rejects a token signed with a different secret', async () => {
      const forged = jwt.sign(
        { sub: teacherId },
        { secret: 'attacker-secret' },
      );
      await getWithToken('/auth/me', forged).expect(401);
    });

    it('rejects a token whose payload was edited after signing', async () => {
      const [header, , signature] = (await tokenFor('student1')).split('.');
      const tampered = `${header}.${base64url({ sub: teacherId })}.${signature}`;
      await getWithToken('/auth/me', tampered).expect(401);
    });

    it('rejects an unsigned ("alg: none") token', async () => {
      const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: teacherId })}.`;
      await getWithToken('/auth/me', unsigned).expect(401);
    });

    it('rejects an expired token', async () => {
      const expired = jwt.sign({ sub: studentId }, { expiresIn: -60 });
      await getWithToken('/auth/me', expired).expect(401);
    });

    it('rejects a valid token once the account has been deleted', async () => {
      const temp = await prisma.user.create({
        data: {
          username: 'temp-student',
          fullName: 'Temp',
          passwordHash: 'x',
          role: 'STUDENT',
          classId,
        },
      });
      const token = jwt.sign({ sub: temp.id });
      await getWithToken('/auth/me', token).expect(200);
      await prisma.user.delete({ where: { id: temp.id } });
      await getWithToken('/auth/me', token).expect(401);
    });

    it('keeps public routes public', async () => {
      await request(app.getHttpServer()).get('/').expect(200);
    });
  });

  describe('role checks', () => {
    it('lets a teacher reach teacher-only routes but not student-only ones', async () => {
      const token = await tokenFor('teacher1');
      await getWithToken('/test-roles/teacher', token).expect(200);
      await getWithToken('/test-roles/student', token).expect(403);
      await getWithToken('/test-roles/any-role', token).expect(200);
    });

    it('lets a student reach student-only routes but not teacher-only ones', async () => {
      const token = await tokenFor('student1');
      await getWithToken('/test-roles/student', token).expect(200);
      await getWithToken('/test-roles/teacher', token).expect(403);
      await getWithToken('/test-roles/any-role', token).expect(200);
    });

    it('takes the role from the database, not from a role claim in the token', async () => {
      // Even a correctly signed token that claims TEACHER doesn't make a student a teacher.
      const token = jwt.sign({ sub: studentId, role: 'TEACHER' });
      await getWithToken('/test-roles/teacher', token).expect(403);
    });

    it('requires a login before checking the role', async () => {
      await request(app.getHttpServer()).get('/test-roles/teacher').expect(401);
    });
  });
});
