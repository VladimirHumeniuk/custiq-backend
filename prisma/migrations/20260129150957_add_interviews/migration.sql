/*
  Warnings:

  - You are about to drop the column `interviewLength` on the `Research` table. All the data in the column will be lost.
  - You are about to drop the column `interviewSlug` on the `Research` table. All the data in the column will be lost.
  - You are about to drop the column `interviewTone` on the `Research` table. All the data in the column will be lost.
  - You are about to drop the column `interviewUrl` on the `Research` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Research_interviewSlug_key";

-- AlterTable
ALTER TABLE "Research" DROP COLUMN "interviewLength",
DROP COLUMN "interviewSlug",
DROP COLUMN "interviewTone",
DROP COLUMN "interviewUrl";

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interviewSlug" TEXT NOT NULL,
    "interviewUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publicTitle" TEXT NOT NULL,
    "interviewLength" TEXT NOT NULL,
    "interviewTone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Interview_interviewSlug_key" ON "Interview"("interviewSlug");

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
