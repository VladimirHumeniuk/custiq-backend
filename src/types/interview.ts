export const interviewLengths = [
  "15 min",
  "30 min",
  "45 min",
  "60 min",
] as const;

export const interviewTones = [
  "Conversational",
  "Professional",
  "Empathetic",
] as const;

export type InterviewLength = (typeof interviewLengths)[number];
export type InterviewTone = (typeof interviewTones)[number];

export type InterviewPayload = {
  title: string;
  publicTitle: string;
  interviewLength: InterviewLength;
  interviewTone: InterviewTone;
  researchId: string;
};
