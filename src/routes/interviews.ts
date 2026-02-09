import type { FastifyInstance, FastifyReply } from "fastify";
import { Prisma } from "@prisma/client";
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

  app.get<{
    Querystring: { page?: string; limit?: string; search?: string; sortBy?: string; sortDir?: string };
  }>("/interviews", async (request, reply) => {
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

    const page = Math.max(1, Number(request.query?.page) || 1);
    const limit = Math.min(50, Math.max(5, Number(request.query?.limit) || 20));
    const sortBy = (request.query?.sortBy ?? "updatedAt").toString();
    const sortDir = (request.query?.sortDir ?? "desc").toString() === "asc" ? "asc" : "desc";
    const sortOrder: Prisma.SortOrder = sortDir === "asc" ? "asc" : "desc";
    const skip = (page - 1) * limit;
    const search = request.query?.search?.toString().trim();

    const where: Prisma.InterviewWhereInput = {
      userId: user.id,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { publicTitle: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const totalCount = await prisma.interview.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const safePage = Math.min(page, totalPages);
    const safeSkip = (safePage - 1) * limit;

    const orderBy =
      sortBy === "sessions"
        ? [{ sessions: { _count: sortOrder } }, { updatedAt: Prisma.SortOrder.desc }]
        : [{ updatedAt: sortOrder }, { createdAt: Prisma.SortOrder.desc }];

    const interviews = await prisma.interview.findMany({
      where,
      include: {
        research: {
          select: {
            id: true,
            researchName: true,
            primaryGoal: true,
          },
        },
        _count: {
          select: { sessions: true },
        },
      },
      orderBy,
      skip: safeSkip,
      take: limit,
    });

    reply.send({
      data: interviews.map((interview) => {
        const { _count, ...rest } = interview;
        return {
          ...rest,
          sessionsCount: _count.sessions,
        };
      }),
      page: safePage,
      totalPages,
      totalCount,
    });
  });

  app.get("/interviews/metrics", async (request, reply) => {
    const clerkUserId = request.user?.userId;
    if (!clerkUserId) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true, completedSessionsCount: true },
    });

    if (!user) {
      reply.code(404).send({ error: "User not found" });
      return;
    }

    const [interviewsCount, dbCompletedCount, reports] = await Promise.all([
      prisma.interview.count({ where: { userId: user.id } }),
      prisma.interviewSession.count({
        where: { interview: { userId: user.id }, completed: true },
      }),
      prisma.interviewReport.findMany({
        where: { session: { interview: { userId: user.id } } },
        select: { reviewJson: true },
      }),
    ]);

    let completedSessionsCount = user.completedSessionsCount ?? 0;
    if (dbCompletedCount > completedSessionsCount) {
      await prisma.user.update({
        where: { id: user.id },
        data: { completedSessionsCount: dbCompletedCount },
      });
      completedSessionsCount = dbCompletedCount;
    }

    const insightsCount = reports.reduce((total, report) => {
      const insights = (report.reviewJson as { insights?: unknown } | null)?.insights;
      if (Array.isArray(insights)) {
        return total + insights.length;
      }
      return total;
    }, 0);

    reply.send({ interviewsCount, sessionsCount: completedSessionsCount, insightsCount });
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

  app.get<{
    Params: { id: string };
    Querystring: { page?: string; limit?: string; sortBy?: string; sortDir?: string; search?: string };
  }>("/interviews/:id/sessions", async (request, reply) => {
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

    const interviewId = request.params.id?.trim();
    if (!interviewId) {
      reply.code(400).send({ error: "Interview id is required" });
      return;
    }

    const interview = await prisma.interview.findFirst({
      where: { id: interviewId, userId: user.id },
      select: { id: true },
    });

    if (!interview) {
      reply.code(404).send({ error: "Interview not found" });
      return;
    }

    const page = Math.max(1, Number(request.query?.page) || 1);
    const limit = Math.min(50, Math.max(5, Number(request.query?.limit) || 10));
    const sortBy = (request.query?.sortBy ?? "date").toString();
    const sortDir = (request.query?.sortDir ?? "desc").toString() === "asc" ? "asc" : "desc";
    const sortOrder: Prisma.SortOrder = sortDir === "asc" ? "asc" : "desc";
    const skip = (page - 1) * limit;
    const search = request.query?.search?.toString().trim();

    const where: Prisma.InterviewSessionWhereInput = {
      interviewId: interviewId,
      ...(search
        ? {
            OR: [
              { participantName: { contains: search, mode: "insensitive" } },
              { participantEmail: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const baseSelect = {
      id: true,
      status: true,
      mode: true,
      participantName: true,
      participantEmail: true,
      startedAt: true,
      endedAt: true,
      completed: true,
      createdAt: true,
      report: {
        select: {
          id: true,
          createdAt: true,
          interviewCompleted: true,
          keyQuotesJson: true,
          painsJson: true,
          opportunitiesJson: true,
          reviewJson: true,
        },
      },
    } as const;

    const totalCount = await prisma.interviewSession.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const safePage = Math.min(page, totalPages);
    const safeSkip = (safePage - 1) * limit;

    if (sortBy === "duration") {
      const searchClause = search
        ? Prisma.sql`and ("participantName" ilike ${`%${search}%`} or "participantEmail" ilike ${`%${search}%`})`
        : Prisma.empty;
      const ids = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        select "id"
        from "InterviewSession"
        where "interviewId" = ${interviewId}
        ${searchClause}
        order by
          coalesce(extract(epoch from ("endedAt" - "startedAt")), 0) ${Prisma.raw(sortDir)}
        , "startedAt" desc
        limit ${limit} offset ${safeSkip}
      `);

      const idList = ids.map((row) => row.id);
      if (idList.length === 0) {
        reply.send({ data: [], page: safePage, totalPages, totalCount });
        return;
      }

      const sessions = await prisma.interviewSession.findMany({
        where: { id: { in: idList } },
        select: baseSelect,
      });

      const byId = new Map(sessions.map((session) => [session.id, session]));
      const ordered = idList.map((id) => byId.get(id)).filter(Boolean);

      reply.send({ data: ordered, page: safePage, totalPages, totalCount });
      return;
    }

    const orderBy =
      sortBy === "type"
        ? [{ mode: sortOrder }, { startedAt: Prisma.SortOrder.desc }]
        : sortBy === "status"
          ? [
              { status: sortOrder },
              { completed: sortOrder },
              { startedAt: Prisma.SortOrder.desc },
            ]
          : [{ startedAt: sortOrder }, { createdAt: Prisma.SortOrder.desc }];

    const sessions = await prisma.interviewSession.findMany({
      where,
      select: baseSelect,
      orderBy,
      skip: safeSkip,
      take: limit,
    });

    reply.send({
      data: sessions,
      page: safePage,
      totalPages,
      totalCount,
    });
  });

  app.delete<{ Params: { id: string } }>("/interviews/:id", async (request, reply) => {
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

    const result = await prisma.interview.deleteMany({
      where: { id: request.params.id, userId: user.id },
    });

    if (result.count === 0) {
      reply.code(404).send({ error: "Interview not found" });
      return;
    }

    reply.send({ ok: true });
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
