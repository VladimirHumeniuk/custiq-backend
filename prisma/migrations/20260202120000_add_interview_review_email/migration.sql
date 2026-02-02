-- Add participant email to interview sessions
ALTER TABLE "InterviewSession" ADD COLUMN "participantEmail" TEXT;

-- Add review JSON to interview reports
ALTER TABLE "InterviewReport" ADD COLUMN "reviewJson" JSONB;
