-- Additive: exam quick links, external mock tests and their attempts.
-- CreateEnum
CREATE TYPE "LinkCategory" AS ENUM ('OFFICIAL', 'SYLLABUS', 'PYQ', 'NOTES', 'OTHER');

-- CreateEnum
CREATE TYPE "MockTestType" AS ENUM ('FULL', 'SECTIONAL', 'PYQ');

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'MOCK_ATTEMPTED';

-- CreateTable
CREATE TABLE "ExamLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" "LinkCategory" NOT NULL DEFAULT 'OTHER',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockTest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "testType" "MockTestType" NOT NULL DEFAULT 'FULL',
    "maxScore" DOUBLE PRECISION NOT NULL,
    "durationMinutes" INTEGER,
    "marksCorrect" DOUBLE PRECISION,
    "marksWrong" DOUBLE PRECISION,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mockTestId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "correct" INTEGER,
    "wrong" INTEGER,
    "skipped" INTEGER,
    "timeMinutes" INTEGER,
    "reflection" TEXT,
    "attemptedOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamLink_userId_idx" ON "ExamLink"("userId");

-- CreateIndex
CREATE INDEX "ExamLink_examId_displayOrder_idx" ON "ExamLink"("examId", "displayOrder");

-- CreateIndex
CREATE INDEX "MockTest_userId_idx" ON "MockTest"("userId");

-- CreateIndex
CREATE INDEX "MockTest_examId_displayOrder_idx" ON "MockTest"("examId", "displayOrder");

-- CreateIndex
CREATE INDEX "MockAttempt_userId_idx" ON "MockAttempt"("userId");

-- CreateIndex
CREATE INDEX "MockAttempt_mockTestId_attemptedOn_idx" ON "MockAttempt"("mockTestId", "attemptedOn");

-- AddForeignKey
ALTER TABLE "ExamLink" ADD CONSTRAINT "ExamLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamLink" ADD CONSTRAINT "ExamLink_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockTest" ADD CONSTRAINT "MockTest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockTest" ADD CONSTRAINT "MockTest_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockAttempt" ADD CONSTRAINT "MockAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockAttempt" ADD CONSTRAINT "MockAttempt_mockTestId_fkey" FOREIGN KEY ("mockTestId") REFERENCES "MockTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

