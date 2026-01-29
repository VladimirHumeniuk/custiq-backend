/*
  Warnings:

  - You are about to drop the column `companyName` on the `Research` table. All the data in the column will be lost.
  - You are about to drop the column `shortAbout` on the `Research` table. All the data in the column will be lost.
  - Added the required column `researchName` to the `Research` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Research" DROP COLUMN "companyName",
DROP COLUMN "shortAbout",
ADD COLUMN     "researchName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "shortAbout" TEXT;
