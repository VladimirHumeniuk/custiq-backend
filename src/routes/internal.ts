import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

function checkInternalSecret(
  request: FastifyRequest<{ Querystring?: { minutes?: string }; Params?: { id?: string } }>,
  reply: FastifyReply,
  appConfig: { INTERNAL_CRON_SECRET?: string },
): boolean {
  const secret = appConfig.INTERNAL_CRON_SECRET;
  if (!secret) {
    reply.code(501).send({ error: "Internal cron not configured" });
    return false;
  }
  const header =
    (request.headers["x-internal-secret"] as string) ??
    request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (header !== secret) {
    reply.code(401).send({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export async function internalRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { minutes?: string } }>(
    "/internal/sessions/stale",
    async (request, reply) => {
      if (!checkInternalSecret(request, reply, app.config as { INTERNAL_CRON_SECRET?: string })) {
        return;
      }
      const minutes = Math.min(60, Math.max(5, Number(request.query?.minutes) || 30));
      const cutoff = new Date(Date.now() - minutes * 60 * 1000);

      const sessions = await prisma.interviewSession.findMany({
        where: {
          status: "active",
          lastActivityAt: { lt: cutoff },
        },
        select: {
          id: true,
          interviewId: true,
          mode: true,
          participantName: true,
          participantEmail: true,
          startedAt: true,
          endedAt: true,
          segments: {
            orderBy: { createdAt: "asc" },
            select: { role: true, text: true },
          },
        },
      });

      reply.send(sessions);
    },
  );

  app.patch<{ Params: { id: string }; Body: { status?: string; endedAt?: string; completed?: boolean } }>(
    "/internal/sessions/:id",
    async (request, reply) => {
      if (!checkInternalSecret(request, reply, app.config as { INTERNAL_CRON_SECRET?: string })) {
        return;
      }
      const id = request.params.id?.trim();
      if (!id) {
        reply.code(400).send({ error: "id required" });
        return;
      }
      const body = request.body ?? {};
      const updates: { status?: string; endedAt?: Date; completed?: boolean } = {};
      if (body.status !== undefined) updates.status = String(body.status);
      if (body.endedAt !== undefined) updates.endedAt = new Date(body.endedAt);
      if (body.completed !== undefined) updates.completed = Boolean(body.completed);

      const session = await prisma.interviewSession.findUnique({
        where: { id },
        select: { id: true, completed: true, createdBy: true },
      });

      if (!session) {
        reply.code(404).send({ error: "Session not found" });
        return;
      }

      const shouldIncrementCompleted =
        body.completed !== undefined && Boolean(body.completed) && !session.completed;

      if (shouldIncrementCompleted) {
        await prisma.$transaction([
          prisma.interviewSession.update({
            where: { id },
            data: updates,
          }),
          prisma.user.update({
            where: { id: session.createdBy },
            data: { completedSessionsCount: { increment: 1 } },
          }),
        ]);
      } else {
        await prisma.interviewSession.update({
          where: { id },
          data: updates,
        });
      }
      reply.send({ ok: true });
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      summary: string;
      keyQuotesJson: unknown;
      painsJson: unknown;
      opportunitiesJson: unknown;
      reviewJson?: unknown;
      interviewCompleted?: boolean;
    };
  }>("/internal/sessions/:id/report", async (request, reply) => {
    if (!checkInternalSecret(request, reply, app.config as { INTERNAL_CRON_SECRET?: string })) {
      return;
    }
    const id = request.params.id?.trim();
    if (!id) {
      reply.code(400).send({ error: "id required" });
      return;
    }
    const body = request.body;
    if (!body || typeof body.summary !== "string") {
      reply.code(400).send({ error: "summary required" });
      return;
    }

    await prisma.interviewReport.upsert({
      where: { interviewSessionId: id },
      create: {
        interviewSessionId: id,
        summary: body.summary,
        keyQuotesJson: (body.keyQuotesJson ?? []) as object,
        painsJson: (body.painsJson ?? []) as object,
        opportunitiesJson: (body.opportunitiesJson ?? []) as object,
        reviewJson: body.reviewJson ? (body.reviewJson as object) : Prisma.JsonNull,
        interviewCompleted: body.interviewCompleted !== false,
      },
      update: {
        summary: body.summary,
        keyQuotesJson: (body.keyQuotesJson ?? []) as object,
        painsJson: (body.painsJson ?? []) as object,
        opportunitiesJson: (body.opportunitiesJson ?? []) as object,
        reviewJson: body.reviewJson ? (body.reviewJson as object) : Prisma.JsonNull,
        interviewCompleted: body.interviewCompleted !== false,
      },
    });
    reply.send({ ok: true });
  });
}
