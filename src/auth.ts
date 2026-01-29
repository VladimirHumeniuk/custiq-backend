import { verifyToken } from "@clerk/backend";
import type { FastifyReply, FastifyRequest } from "fastify";

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Missing authorization token" });
    return;
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const payload = await verifyToken(token, {
      secretKey: request.server.config.CLERK_SECRET_KEY,
    });

    if (!payload?.sub) {
      reply.code(401).send({ error: "Invalid or expired token" });
      return;
    }

    request.user = {
      userId: payload.sub,
      sessionId: payload.sid,
    };
  } catch (error) {
    reply.code(401).send({ error: "Unauthorized" });
  }
}

