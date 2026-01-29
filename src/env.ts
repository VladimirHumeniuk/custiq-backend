import env from "@fastify/env";
import type { FastifyInstance } from "fastify";

const schema = {
  type: "object",
  required: [
    "PORT",
    "CLERK_SECRET_KEY",
    "CLERK_PUBLISHABLE_KEY",
    "CLERK_WEBHOOK_SECRET",
  ],
  properties: {
    PORT: { type: "number", default: 4001 },
    HOST: { type: "string", default: "0.0.0.0" },
    CORS_ORIGIN: { type: "string", default: "http://localhost:3000" },
    DATABASE_URL: { type: "string" },
    CLERK_PUBLISHABLE_KEY: { type: "string" },
    CLERK_SECRET_KEY: { type: "string" },
    CLERK_WEBHOOK_SECRET: { type: "string" },
  },
};

export async function registerEnv(app: FastifyInstance) {
  await app.register(env, {
    schema,
    dotenv: true,
  });
}

