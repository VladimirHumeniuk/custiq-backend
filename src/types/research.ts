export const primaryInterviewGoals = [
  "Discovery Research",
  "Concept Validation",
  "Usability Testing",
  "Competitive Analysis",
] as const;

export const researchAudiences = [
  "Existing Customers",
  "Potential Customers",
  "Churned Users",
  "Internal Stakeholders",
] as const;

export const researchFocusAreas = [
  "Overall experience",
  "Expectations & needs",
  "Challenges & blockers",
  "Decision-making process",
  "Pricing perception",
  "Relationship / communication",
] as const;

export type PrimaryInterviewGoal = (typeof primaryInterviewGoals)[number];
export type ResearchAudience = (typeof researchAudiences)[number];
export type ResearchFocusArea = (typeof researchFocusAreas)[number];

export type ResearchPayload = {
  researchName: string;
  researchAbout: string | null;
  primaryGoal: PrimaryInterviewGoal;
  audiences: ResearchAudience[];
  focusAreas: ResearchFocusArea[];
  deepDive: string | null;
  competitors: string | null;
  topicsToAvoid: string | null;
};

export type CompanyInfoPayload = {
  companyName: string;
  shortAbout: string;
  blockedTopics: string[];
  interviewLanguage: "English" | "Ukrainian";
  primaryCustomerType: "Individuals" | "Small teams" | "Businesses" | "Mixed";
};
