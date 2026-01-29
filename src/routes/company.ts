import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../db.js";
import { type CompanyInfoPayload } from "../types/research.js";

const maxCompanyName = 80;
const maxShortAbout = 220;
const maxBlockedTopics = 10;
const allowedLanguages = ["English", "Ukrainian"] as const;
const allowedCustomerTypes = [
  "Individuals",
  "Small teams",
  "Businesses",
  "Mixed",
] as const;

const sanitizeText = (value: string | null | undefined) =>
  value?.trim() ?? "";

const validatePayload = (body: CompanyInfoPayload, reply: FastifyReply) => {
  const companyName = sanitizeText(body.companyName);
  const shortAbout = sanitizeText(body.shortAbout);
  const blockedTopics = Array.isArray(body.blockedTopics)
    ? body.blockedTopics
        .map((topic) => sanitizeText(topic))
        .filter((topic) => Boolean(topic))
    : [];
  const interviewLanguage = body.interviewLanguage;
  const primaryCustomerType = body.primaryCustomerType;

  if (!companyName || companyName.length > maxCompanyName) {
    reply.code(400).send({ error: "Invalid company name" });
    return null;
  }

  if (!shortAbout || shortAbout.length > maxShortAbout) {
    reply.code(400).send({ error: "Invalid short description" });
    return null;
  }

  if (blockedTopics.length > maxBlockedTopics) {
    reply.code(400).send({ error: "Too many blocked topics" });
    return null;
  }

  if (!allowedLanguages.includes(interviewLanguage)) {
    reply.code(400).send({ error: "Invalid interview language" });
    return null;
  }

  if (!primaryCustomerType || !allowedCustomerTypes.includes(primaryCustomerType)) {
    reply.code(400).send({ error: "Invalid primary customer type" });
    return null;
  }

  return {
    companyName,
    shortAbout,
    blockedTopics,
    interviewLanguage,
    primaryCustomerType,
  };
};

export async function companyRoutes(app: FastifyInstance) {
  app.get("/company-info", async (request, reply) => {
    const clerkUserId = request.user?.userId;
    if (!clerkUserId) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { clerkUserId },
      select: {
        companyName: true,
        shortAbout: true,
        blockedTopics: true,
        interviewLanguage: true,
        primaryCustomerType: true,
        settingsConfigured: true,
      },
    });

    if (!user) {
      reply.code(404).send({ error: "User not found" });
      return;
    }

    reply.send(user);
  });

  app.put<{ Body: CompanyInfoPayload }>("/company-info", async (request, reply) => {
    const clerkUserId = request.user?.userId;
    if (!clerkUserId) {
      reply.code(401).send({ error: "Unauthorized" });
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

    const user = await prisma.user.update({
      where: { clerkUserId },
      data: {
        companyName: validated.companyName,
        shortAbout: validated.shortAbout,
        blockedTopics: validated.blockedTopics,
        interviewLanguage: validated.interviewLanguage,
        primaryCustomerType: validated.primaryCustomerType,
        settingsConfigured: true,
      },
      select: {
        companyName: true,
        shortAbout: true,
        blockedTopics: true,
        interviewLanguage: true,
        primaryCustomerType: true,
        settingsConfigured: true,
      },
    });

    reply.send(user);
  });
}
