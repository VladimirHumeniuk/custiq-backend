/*
  Warnings:

  - You are about to drop the `ResearchSetup` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ResearchSetup" DROP CONSTRAINT "ResearchSetup_userId_fkey";

-- DropTable
DROP TABLE "ResearchSetup";

-- CreateTable
CREATE TABLE "Research" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interviewSlug" TEXT NOT NULL,
    "interviewUrl" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "shortAbout" TEXT NOT NULL,
    "primaryGoal" TEXT NOT NULL,
    "interviewLength" TEXT NOT NULL,
    "interviewTone" TEXT NOT NULL,
    "audiences" TEXT[],
    "focusAreas" TEXT[],
    "deepDive" TEXT,
    "competitors" TEXT,
    "topicsToAvoid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Research_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Research_interviewSlug_key" ON "Research"("interviewSlug");

-- AddForeignKey
ALTER TABLE "Research" ADD CONSTRAINT "Research_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
