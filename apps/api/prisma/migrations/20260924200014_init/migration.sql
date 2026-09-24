-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'TEACHER');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "classId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "teacherId" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "timeLimitMinutes" INTEGER NOT NULL,
    "negativeMarkPercent" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizClass" (
    "quizId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,

    CONSTRAINT "QuizClass_pkey" PRIMARY KEY ("quizId","classId")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Option" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" DECIMAL(8,2),
    "maxScore" INTEGER,

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "pointsAwarded" DECIMAL(8,2),

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Class_name_key" ON "Class"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_classId_idx" ON "User"("classId");

-- CreateIndex
CREATE INDEX "Quiz_teacherId_idx" ON "Quiz"("teacherId");

-- CreateIndex
CREATE INDEX "QuizClass_classId_idx" ON "QuizClass"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "Question_quizId_position_key" ON "Question"("quizId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Option_questionId_position_key" ON "Option"("questionId", "position");

-- CreateIndex
CREATE INDEX "QuizAttempt_studentId_idx" ON "QuizAttempt"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizAttempt_quizId_studentId_key" ON "QuizAttempt"("quizId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_attemptId_questionId_key" ON "Answer"("attemptId", "questionId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizClass" ADD CONSTRAINT "QuizClass_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizClass" ADD CONSTRAINT "QuizClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (Prisma's schema language can't express these).
-- The API validates the same rules; these are the last line of defence.
-- Listed at the top of prisma/schema.prisma — keep the two in sync.
-- ---------------------------------------------------------------------------

-- A quiz must close after it opens.
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_closesAt_after_opensAt" CHECK ("closesAt" > "opensAt");

-- A quiz needs a positive time limit.
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_timeLimitMinutes_positive" CHECK ("timeLimitMinutes" > 0);

-- Negative marking is a percentage of the question's points: 0 (off) to 100.
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_negativeMarkPercent_range" CHECK ("negativeMarkPercent" BETWEEN 0 AND 100);

-- Every question is worth at least one point.
ALTER TABLE "Question" ADD CONSTRAINT "Question_points_positive" CHECK ("points" > 0);

-- Students belong to exactly one class; teachers belong to none.
ALTER TABLE "User" ADD CONSTRAINT "User_class_matches_role" CHECK (("role" = 'STUDENT') = ("classId" IS NOT NULL));

-- At most one correct option per question. ("Exactly one" is checked when the quiz is
-- published, because a question being authored may not have a correct option yet.)
CREATE UNIQUE INDEX "Option_one_correct_per_question" ON "Option"("questionId") WHERE "isCorrect";
