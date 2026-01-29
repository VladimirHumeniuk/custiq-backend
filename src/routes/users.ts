import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

type SyncUserBody = {
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
};

export async function userRoutes(app: FastifyInstance) {
  app.post<{ Body: SyncUserBody }>("/users/sync", async (request, reply) => {
    const clerkUserId = request.user?.userId;
    if (!clerkUserId) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const email = request.body?.email?.trim();
    if (!email) {
      reply.code(400).send({ error: "Email is required" });
      return;
    }

    const user = await prisma.user.upsert({
      where: { clerkUserId },
      update: {
        email,
        firstName: request.body?.firstName ?? null,
        lastName: request.body?.lastName ?? null,
      },
      create: {
        clerkUserId,
        email,
        firstName: request.body?.firstName ?? null,
        lastName: request.body?.lastName ?? null,
      },
    });

    reply.send({ id: user.id, clerkUserId: user.clerkUserId });
  });
}

