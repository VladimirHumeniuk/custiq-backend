import Fastify from "fastify";
import cors from "@fastify/cors";
import rawBody from "fastify-raw-body";
import { registerEnv } from "./env.js";
import { requireAuth } from "./auth.js";
import { healthRoutes } from "./routes/health.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { userRoutes } from "./routes/users.js";
import { researchRoutes } from "./routes/research.js";
import { companyRoutes } from "./routes/company.js";
import { interviewRoutes } from "./routes/interviews.js";

const app = Fastify({
  logger: true,
  bodyLimit: 1048576,
});

await app.register(rawBody, {
  field: "rawBody",
  global: false,
  encoding: "utf8",
  runFirst: true,
});

await registerEnv(app);

await app.register(cors, {
  origin: app.config.CORS_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

await app.register(healthRoutes);
await app.register(webhookRoutes);
await app.register(userRoutes);
await app.register(researchRoutes);
await app.register(companyRoutes);
await app.register(interviewRoutes);

app.addHook("preHandler", async (request, reply) => {
  if (
    request.url.startsWith("/health") ||
    request.url.startsWith("/webhooks/clerk")
  ) {
    return;
  }

  await requireAuth(request, reply);
});

app.get("/me", async (request) => {
  return {
    userId: request.user?.userId ?? null,
    sessionId: request.user?.sessionId ?? null,
  };
});

const port = app.config.PORT;
const host = app.config.HOST;

try {
  await app.listen({ port, host });
  app.log.info(`API listening on http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

