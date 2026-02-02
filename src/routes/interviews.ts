import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../db.js";
import {
  interviewLengths,
  interviewTones,
  type InterviewPayload,
} from "../types/interview.js";

const maxTitle = 80;
const maxPublicTitle = 80;

const sanitizeText = (value: string | null | undefined) =>
  value?.trim() ?? "";

const generateSlug = () => {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
};

const generateUniqueSlug = async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = generateSlug();
    const existing = await prisma.interview.findUnique({
      where: { interviewSlug: slug },
      select: { id: true },
    });
    if (!existing) {
      return slug;
    }
  }
  return `${generateSlug()}${Date.now().toString(36).slice(-2)}`;
};

const validatePayload = async (
  body: InterviewPayload,
  reply: FastifyReply,
  userId: string,
) => {
  const title = sanitizeText(body.title);
  const publicTitle = sanitizeText(body.publicTitle);

  if (!title || title.length > maxTitle) {
    reply.code(400).send({ error: "Invalid title" });
    return null;
  }

  if (!publicTitle || publicTitle.length > maxPublicTitle) {
    reply.code(400).send({ error: "Invalid public title" });
    return null;
  }

  if (!interviewLengths.includes(body.interviewLength)) {
    reply.code(400).send({ error: "Invalid interview length" });
    return null;
  }

  if (!interviewTones.includes(body.interviewTone)) {
    reply.code(400).send({ error: "Invalid interview tone" });
    return null;
  }

  // Validate researchId (required)
  if (!body.researchId) {
    reply.code(400).send({ error: "Research ID is required" });
    return null;
  }

  const research = await prisma.research.findFirst({
    where: { id: body.researchId, userId },
    select: { id: true },
  });
  if (!research) {
    reply.code(400).send({ error: "Invalid research ID" });
    return null;
  }

  const researchId = body.researchId;

  return { title, publicTitle, researchId };
};

export async function interviewRoutes(app: FastifyInstance) {
  app.get<{ Params: { slug: string } }>(
    "/public/interviews/by-slug/:slug",
    async (request, reply) => {
      const slug = request.params.slug?.trim();
      if (!slug) {
        reply.code(400).send({ error: "Slug is required" });
        return;
      }

      const interview = await prisma.interview.findFirst({
        where: { interviewSlug: slug, active: true },
        include: {
          research: {
            select: {
              id: true,
              researchName: true,
              primaryGoal: true,
            },
          },
        },
      });

      if (!interview) {
        reply.code(404).send({ error: "Interview not found or inactive" });
        return;
      }

      reply.send({
        id: interview.id,
        interviewSlug: interview.interviewSlug,
        publicTitle: interview.publicTitle,
        interviewLength: interview.interviewLength,
        research: interview.research,
      });
    },
  );

  app.get("/interviews", async (request, reply) => {
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

    const interviews = await prisma.interview.findMany({
      where: { userId: user.id },
      include: {
        research: {
          select: {
            id: true,
            researchName: true,
            primaryGoal: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    reply.send(interviews);
  });

  app.get<{ Params: { id: string } }>("/interviews/:id", async (request, reply) => {
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

    const interview = await prisma.interview.findFirst({
      where: { id: request.params.id, userId: user.id },
      include: {
        research: {
          select: {
            id: true,
            researchName: true,
            primaryGoal: true,
          },
        },
      },
    });

    if (!interview) {
      reply.code(404).send({ error: "Interview not found" });
      return;
    }

    reply.send(interview);
  });

  app.post<{ Body: InterviewPayload }>("/interviews", async (request, reply) => {
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

    const validated = await validatePayload(body, reply, user.id);
    if (!validated) {
      return;
    }

    const interviewSlug = await generateUniqueSlug();
    const interviewUrl = `call/${interviewSlug}`;

    const interview = await prisma.interview.create({
      data: {
        userId: user.id,
        researchId: validated.researchId,
        interviewSlug,
        interviewUrl,
        title: validated.title,
        publicTitle: validated.publicTitle,
        interviewLength: body.interviewLength,
        interviewTone: body.interviewTone,
        active: true,
      },
      include: {
        research: {
          select: {
            id: true,
            researchName: true,
            primaryGoal: true,
          },
        },
      },
    });

    reply.send(interview);
  });

  app.patch<{ Body: { active: boolean }; Params: { id: string } }>(
    "/interviews/:id/toggle-active",
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
      if (!body || typeof body.active !== "boolean") {
        reply.code(400).send({ error: "Invalid payload" });
        return;
      }

      const interview = await prisma.interview.updateMany({
        where: { id: request.params.id, userId: user.id },
        data: {
          active: body.active,
        },
      });

      if (interview.count === 0) {
        reply.code(404).send({ error: "Interview not found" });
        return;
      }

      const updated = await prisma.interview.findFirst({
        where: { id: request.params.id, userId: user.id },
        include: {
          research: {
            select: {
              id: true,
              researchName: true,
              primaryGoal: true,
            },
          },
        },
      });

      reply.send(updated);
    },
  );
}
