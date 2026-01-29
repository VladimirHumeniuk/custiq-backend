import type { FastifyInstance } from "fastify";
import { Webhook } from "svix";
import { prisma } from "../db.js";

type ClerkWebhookEvent = {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string }>;
    first_name?: string | null;
    last_name?: string | null;
  };
};

export async function webhookRoutes(app: FastifyInstance) {
  app.post(
    "/webhooks/clerk",
    { config: { rawBody: true } },
    async (request, reply) => {
    const svixIdHeader = request.headers["svix-id"];
    const svixTimestampHeader = request.headers["svix-timestamp"];
    const svixSignatureHeader = request.headers["svix-signature"];

    const svixId = Array.isArray(svixIdHeader) ? svixIdHeader[0] : svixIdHeader;
    const svixTimestamp = Array.isArray(svixTimestampHeader)
      ? svixTimestampHeader[0]
      : svixTimestampHeader;
    const svixSignature = Array.isArray(svixSignatureHeader)
      ? svixSignatureHeader[0]
      : svixSignatureHeader;

    if (!svixId || !svixTimestamp || !svixSignature) {
      reply.code(400).send({ error: "Missing Svix headers" });
      return;
    }

      const rawBody = (request as typeof request & { rawBody?: string }).rawBody;
      const payload =
        typeof rawBody === "string"
          ? rawBody
          : typeof request.body === "string"
            ? request.body
            : JSON.stringify(request.body ?? {});

      const webhook = new Webhook(app.config.CLERK_WEBHOOK_SECRET);

      let event: ClerkWebhookEvent;
      try {
        event = webhook.verify(payload, {
          "svix-id": svixId,
          "svix-timestamp": svixTimestamp,
          "svix-signature": svixSignature,
        }) as ClerkWebhookEvent;
      } catch (error) {
        reply.code(400).send({ error: "Invalid webhook signature" });
        return;
      }

      if (event.type === "user.created" || event.type === "user.updated") {
        const email = event.data.email_addresses?.[0]?.email_address ?? null;
        if (email) {
          await prisma.user.upsert({
            where: { clerkUserId: event.data.id },
            update: {
              email,
              firstName: event.data.first_name ?? null,
              lastName: event.data.last_name ?? null,
            },
            create: {
              clerkUserId: event.data.id,
              email,
              firstName: event.data.first_name ?? null,
              lastName: event.data.last_name ?? null,
            },
          });
        }
      }

      if (event.type === "user.deleted") {
        await prisma.user.deleteMany({
          where: { clerkUserId: event.data.id },
        });
      }

      reply.send({ received: true });
    },
  );
}

