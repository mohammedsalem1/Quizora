import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Boots the real AppModule (same guards, validation and database access as production),
// plus any test-only controllers, and empties the test database.
export async function createTestApp(extraControllers: Type<unknown>[] = []) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  }).compile();
  const app: INestApplication<App> = moduleRef.createNestApplication();
  await app.init();
  const prisma = app.get(PrismaService);

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

  return { app, prisma };
}
