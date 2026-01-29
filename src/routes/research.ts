import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../db.js";
import {
  primaryInterviewGoals,
  researchAudiences,
  researchFocusAreas,
  type ResearchPayload,
} from "../types/research.js";

const maxResearchName = 80;
const maxResearchAbout = 200;
const maxDeepDive = 140;
const maxCompetitors = 120;
const maxTopics = 120;

const sanitizeText = (value: string | null | undefined) =>
  value?.trim() ?? "";

const isValidArray = <T extends readonly string[]>(
  values: unknown,
  allowed: T,
) =>
  Array.isArray(values) &&
  values.every((item) => typeof item === "string" && allowed.includes(item));

const validatePayload = (body: ResearchPayload, reply: FastifyReply) => {
  const researchName = sanitizeText(body.researchName);
  const researchAbout = sanitizeText(body.researchAbout) || null;
  const deepDive = sanitizeText(body.deepDive) || null;
  const competitors = sanitizeText(body.competitors) || null;
  const topicsToAvoid = sanitizeText(body.topicsToAvoid) || null;

  if (!researchName || researchName.length > maxResearchName) {
    reply.code(400).send({ error: "Invalid research name" });
    return null;
  }

  if (researchAbout && researchAbout.length > maxResearchAbout) {
    reply.code(400).send({ error: "Research about is too long" });
    return null;
  }

  if (deepDive && deepDive.length > maxDeepDive) {
    reply.code(400).send({ error: "Deep dive is too long" });
    return null;
  }

  if (competitors && competitors.length > maxCompetitors) {
    reply.code(400).send({ error: "Competitors is too long" });
    return null;
  }

  if (topicsToAvoid && topicsToAvoid.length > maxTopics) {
    reply.code(400).send({ error: "Topics to avoid is too long" });
    return null;
  }

  if (!primaryInterviewGoals.includes(body.primaryGoal)) {
    reply.code(400).send({ error: "Invalid primary goal" });
    return null;
  }

  if (!isValidArray(body.audiences, researchAudiences)) {
    reply.code(400).send({ error: "Invalid audiences" });
    return null;
  }

  if (!isValidArray(body.focusAreas, researchFocusAreas)) {
    reply.code(400).send({ error: "Invalid focus areas" });
    return null;
  }

  return {
    researchName,
    researchAbout,
    deepDive,
    competitors,
    topicsToAvoid,
  };
};

export async function researchRoutes(app: FastifyInstance) {
  app.get("/researches", async (request, reply) => {
    const clerkUserId = request.user?.userId;
    if (!clerkUserId) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { clerkUserId },
    });

    if (!user) {
      reply.code(404).send({ error: "User not found" });
      return;
    }

    const researches = await prisma.research.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });

    reply.send(researches);
  });

  app.get<{ Params: { id: string } }>("/researches/:id", async (request, reply) => {
    const clerkUserId = request.user?.userId;
    if (!clerkUserId) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { clerkUserId },
    });

    if (!user) {
      reply.code(404).send({ error: "User not found" });
      return;
    }

    const research = await prisma.research.findFirst({
      where: { id: request.params.id, userId: user.id },
    });

    if (!research) {
      reply.code(404).send({ error: "Research not found" });
      return;
    }

    reply.send(research);
  });

  app.post<{ Body: ResearchPayload }>("/researches", async (request, reply) => {
    const clerkUserId = request.user?.userId;
    if (!clerkUserId) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { clerkUserId },
    });

    if (!user) {
      reply.code(404).send({ error: "User not found" });
      return;
    }

    const body = request.body;
    if (!body) {
      reply.code(400).send({ error: "Payload is required" });
      return;
    }

    const validated = validatePayload(body, reply);
    if (!validated) {
      return;
    }

    const research = await prisma.research.create({
      data: {
        userId: user.id,
        researchName: validated.researchName,
        researchAbout: validated.researchAbout,
        primaryGoal: body.primaryGoal,
        audiences: body.audiences,
        focusAreas: body.focusAreas,
        deepDive: validated.deepDive,
        competitors: validated.competitors,
        topicsToAvoid: validated.topicsToAvoid,
      },
    });

    reply.send(research);
  });

  app.put<{ Body: ResearchPayload; Params: { id: string } }>(
    "/researches/:id",
    async (request, reply) => {
    const clerkUserId = request.user?.userId;
    if (!clerkUserId) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { clerkUserId },
    });

    if (!user) {
      reply.code(404).send({ error: "User not found" });
      return;
    }

    const body = request.body;
    if (!body) {
      reply.code(400).send({ error: "Payload is required" });
      return;
    }

    const validated = validatePayload(body, reply);
    if (!validated) {
      return;
    }

    const research = await prisma.research.updateMany({
      where: { id: request.params.id, userId: user.id },
      data: {
        researchName: validated.researchName,
        researchAbout: validated.researchAbout,
        primaryGoal: body.primaryGoal,
        audiences: body.audiences,
        focusAreas: body.focusAreas,
        deepDive: validated.deepDive,
        competitors: validated.competitors,
        topicsToAvoid: validated.topicsToAvoid,
      },
    });

    if (research.count === 0) {
      reply.code(404).send({ error: "Research not found" });
      return;
    }

    const updated = await prisma.research.findFirst({
      where: { id: request.params.id, userId: user.id },
    });

    reply.send(updated);
    },
  );
}
