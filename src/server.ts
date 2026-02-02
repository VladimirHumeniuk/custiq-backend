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
import { sessionRoutes } from "./routes/sessions.js";
import { internalRoutes } from "./routes/internal.js";

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
  allowedHeaders: ["Content-Type", "Authorization", "X-Session-Token", "x-session-token"],
});

// Ensure preflight allows X-Session-Token (browsers send lowercase in Access-Control-Request-Headers)
app.addHook("onRequest", (request, reply, done) => {
  if (request.method === "OPTIONS") {
    reply.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Session-Token, x-session-token",
    );
  }
  done();
});

await app.register(healthRoutes);
await app.register(webhookRoutes);
await app.register(userRoutes);
await app.register(researchRoutes);
await app.register(companyRoutes);
await app.register(interviewRoutes);
await app.register(sessionRoutes);
await app.register(internalRoutes);

app.addHook("preHandler", async (request, reply) => {
  const path = request.url?.split("?")[0] ?? "";
  const routePath = (request as { routerPath?: string }).routerPath ?? "";

  const isPublic =
    path.startsWith("/health") ||
    path.startsWith("/webhooks/clerk") ||
    path.startsWith("/public") ||
    path.startsWith("/internal") ||
    path.includes("public/interviews/by-slug") ||
    routePath.startsWith("/public") ||
    routePath.startsWith("/internal");

  if (isPublic) {
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

