import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";

const sessionTokenBytes = 32;
const modes = ["text", "voice"] as const;
type SessionMode = (typeof modes)[number];

function generateSessionToken(): string {
  return randomBytes(sessionTokenBytes).toString("hex");
}

function getSessionToken(request: FastifyRequest): string | null {
  const rawHeader = request.headers["x-session-token"] ?? request.headers["authorization"];
  const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const query = (request.query as { token?: string } | undefined)?.token;
  const value = (header?.replace(/^Bearer\s+/i, "") ?? query ?? "").trim();
  return value || null;
}

async function resolveSession(request: FastifyRequest, reply: FastifyReply) {
  const id = (request.params as { id?: string } | undefined)?.id?.trim();
  const token = getSessionToken(request);
  if (!token && !id) {
    reply.code(400).send({ error: "Session token or session id required" });
    return null;
  }
  if (token) {
    const byToken = await prisma.interviewSession.findUnique({
      where: { sessionToken: token },
      include: {
        research: { select: { id: true, researchName: true, primaryGoal: true, researchAbout: true, audiences: true, focusAreas: true, deepDive: true, competitors: true, topicsToAvoid: true } },
        interview: { select: { id: true, publicTitle: true, interviewLength: true, interviewTone: true } },
      },
    });
    if (byToken) return byToken;
    if (!id) {
      reply.code(404).send({ error: "Session not found" });
      return null;
    }
  }
  const byId = await prisma.interviewSession.findUnique({
    where: { id: id! },
    include: {
      research: { select: { id: true, researchName: true, primaryGoal: true, researchAbout: true, audiences: true, focusAreas: true, deepDive: true, competitors: true, topicsToAvoid: true } },
      interview: { select: { id: true, publicTitle: true, interviewLength: true, interviewTone: true } },
    },
  });
  if (!byId) {
    reply.code(404).send({ error: "Session not found" });
    return null;
  }
  if (token && byId.sessionToken !== token) {
    reply.code(403).send({ error: "Invalid session token" });
    return null;
  }
  return byId;
}

function buildGlobalSnapshot(user: { companyName: string | null; shortAbout: string | null; blockedTopics: string[]; interviewLanguage: string; primaryCustomerType: string | null }) {
  return {
    companyName: user.companyName ?? "",
    shortAbout: user.shortAbout ?? "",
    blockedTopics: user.blockedTopics ?? [],
    interviewLanguage: user.interviewLanguage,
    primaryCustomerType: user.primaryCustomerType ?? "",
  };
}

function buildResearchSnapshot(research: { researchName: string; researchAbout: string | null; primaryGoal: string; audiences: string[]; focusAreas: string[]; deepDive: string | null; competitors: string | null; topicsToAvoid: string | null }) {
  return {
    researchName: research.researchName,
    researchAbout: research.researchAbout ?? "",
    primaryGoal: research.primaryGoal,
    audiences: research.audiences ?? [],
    focusAreas: research.focusAreas ?? [],
    deepDive: research.deepDive ?? "",
    competitors: research.competitors ?? "",
    topicsToAvoid: research.topicsToAvoid ?? "",
  };
}

function toneToPersonaId(tone: string): string {
  const lower = tone.toLowerCase();
  if (lower.includes("conversational")) return "conversational";
  if (lower.includes("professional")) return "professional";
  if (lower.includes("empathetic")) return "empathetic";
  return "professional";
}

export async function sessionRoutes(app: FastifyInstance) {
  app.get("/public/sessions/ok", async (_request, reply) => {
    reply.send({ ok: true, message: "session routes loaded" });
  });

  app.post<{
    Body: { slug?: string; participantName?: string; mode?: string };
  }>("/public/sessions", async (request, reply) => {
    const body = request.body;
    if (!body) {
      reply.code(400).send({ error: "Body required" });
      return;
    }
    const slug = (body.slug ?? "").trim();
    const participantName = (body.participantName ?? "").trim();
    const mode = body.mode as SessionMode | undefined;
    if (!slug) {
      reply.code(400).send({ error: "slug is required" });
      return;
    }
    if (!participantName) {
      reply.code(400).send({ error: "participantName is required" });
      return;
    }
    if (!mode || !modes.includes(mode)) {
      reply.code(400).send({ error: "mode must be 'text' or 'voice'" });
      return;
    }

    const interview = await prisma.interview.findFirst({
      where: { interviewSlug: slug, active: true },
      include: {
        research: true,
        user: {
          select: {
            id: true,
            companyName: true,
            shortAbout: true,
            blockedTopics: true,
            interviewLanguage: true,
            primaryCustomerType: true,
          },
        },
      },
    });

    if (!interview?.researchId || !interview.research) {
      reply.code(404).send({ error: "Interview not found or inactive" });
      return;
    }

    const research = interview.research;
    const user = interview.user;
    const globalContextSnapshot = buildGlobalSnapshot(user);
    const researchContextSnapshot = buildResearchSnapshot(research);
    const personaId = toneToPersonaId(interview.interviewTone);
    const sessionToken = generateSessionToken();

    const created = await prisma.interviewSession.create({
      data: {
        researchId: research.id,
        interviewId: interview.id,
        createdBy: user.id,
        status: "active",
        mode,
        participantName,
        sessionToken,
        promptVersionId: "interviewer_v1",
        personaId,
        globalContextSnapshot: globalContextSnapshot as object,
        researchContextSnapshot: researchContextSnapshot as object,
      },
      include: {
        research: { select: { researchName: true } },
        interview: { select: { publicTitle: true, interviewLength: true } },
      },
    });

    reply.send({
      sessionId: created.id,
      sessionToken: created.sessionToken,
      publicTitle: created.interview.publicTitle,
      interviewLength: created.interview.interviewLength,
      mode: created.mode,
      participantName: created.participantName,
    });
  });

  app.get<{ Querystring: { token?: string } }>("/public/sessions/by-token", async (request, reply) => {
    const token = (request.query?.token ?? "").trim();
    if (!token) {
      reply.code(400).send({ error: "token query is required" });
      return;
    }
    const session = await prisma.interviewSession.findUnique({
      where: { sessionToken: token },
      include: {
        segments: { orderBy: { createdAt: "asc" } },
        research: { select: { researchName: true } },
        interview: { select: { publicTitle: true, interviewLength: true } },
      },
    });
    if (!session) {
      reply.code(404).send({ error: "Session not found" });
      return;
    }
    reply.send({
      sessionId: session.id,
      sessionToken: session.sessionToken,
      status: session.status,
      mode: session.mode,
      publicTitle: session.interview.publicTitle,
      interviewLength: session.interview.interviewLength,
      participantName: session.participantName,
      promptVersionId: session.promptVersionId,
      personaId: session.personaId,
      globalContextSnapshot: session.globalContextSnapshot,
      researchContextSnapshot: session.researchContextSnapshot,
      segments: session.segments,
    });
  });

  app.get<{ Params: { id: string }; Querystring: { token?: string } }>("/public/sessions/:id", async (request, reply) => {
    const session = await resolveSession(request, reply);
    if (!session) return;
    const segments = await prisma.transcriptSegment.findMany({
      where: { interviewSessionId: session.id },
      orderBy: { createdAt: "asc" },
    });
    reply.send({
      ...session,
      segments,
    });
  });

  app.post<{
    Params: { id: string };
    Body: { segments?: Array<{ role: string; text: string; tsStart?: number; tsEnd?: number; metaJson?: object }> };
  }>("/public/sessions/:id/transcript-segments", async (request, reply) => {
    const session = await resolveSession(request, reply);
    if (!session) return;
    if (session.status !== "active") {
      reply.code(400).send({ error: "Session is not active" });
      return;
    }
    const segments = request.body?.segments;
    if (!Array.isArray(segments) || segments.length === 0) {
      reply.code(400).send({ error: "segments array is required" });
      return;
    }
    const now = new Date();
    await prisma.$transaction([
      prisma.transcriptSegment.createMany({
        data: segments.map((s) => ({
          interviewSessionId: session.id,
          role: String(s.role ?? "user").slice(0, 32),
          text: String(s.text ?? ""),
          tsStart: typeof s.tsStart === "number" ? s.tsStart : null,
          tsEnd: typeof s.tsEnd === "number" ? s.tsEnd : null,
          metaJson: s.metaJson ?? undefined,
        })),
      }),
      prisma.interviewSession.update({
        where: { id: session.id },
        data: { lastActivityAt: now },
      }),
    ]);
    reply.send({ ok: true });
  });

  app.patch<{
    Params: { id: string };
    Body: { status?: string; endedAt?: string; completed?: boolean; lastActivityAt?: string; compiledPromptHash?: string };
  }>("/public/sessions/:id", async (request, reply) => {
    const session = await resolveSession(request, reply);
    if (!session) return;
    const body = request.body ?? {};
    const updates: { status?: string; endedAt?: Date; completed?: boolean; lastActivityAt?: Date; compiledPromptHash?: string } = {};
    if (body.status !== undefined) updates.status = String(body.status);
    if (body.endedAt !== undefined) updates.endedAt = new Date(body.endedAt);
    if (body.completed !== undefined) updates.completed = Boolean(body.completed);
    if (body.lastActivityAt !== undefined) updates.lastActivityAt = new Date(body.lastActivityAt);
    if (body.compiledPromptHash !== undefined) updates.compiledPromptHash = String(body.compiledPromptHash);
    await prisma.interviewSession.update({
      where: { id: session.id },
      data: updates,
    });
    reply.send({ ok: true });
  });

  app.post<{
    Params: { id: string };
    Body: { summary: string; keyQuotesJson: unknown; painsJson: unknown; opportunitiesJson: unknown; interviewCompleted?: boolean };
  }>("/public/sessions/:id/report", async (request, reply) => {
    const session = await resolveSession(request, reply);
    if (!session) return;
    const body = request.body;
    if (!body || typeof body.summary !== "string") {
      reply.code(400).send({ error: "summary is required" });
      return;
    }
    const keyQuotesJson = body.keyQuotesJson ?? [];
    const painsJson = body.painsJson ?? [];
    const opportunitiesJson = body.opportunitiesJson ?? [];
    const interviewCompleted = body.interviewCompleted !== false;

    await prisma.interviewReport.upsert({
      where: { interviewSessionId: session.id },
      create: {
        interviewSessionId: session.id,
        summary: body.summary,
        keyQuotesJson: keyQuotesJson as object,
        painsJson: painsJson as object,
        opportunitiesJson: opportunitiesJson as object,
        interviewCompleted,
      },
      update: {
        summary: body.summary,
        keyQuotesJson: keyQuotesJson as object,
        painsJson: painsJson as object,
        opportunitiesJson: opportunitiesJson as object,
        interviewCompleted,
      },
    });
    reply.send({ ok: true });
  });
}
