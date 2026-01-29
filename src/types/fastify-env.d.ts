import "fastify";

declare module "fastify" {
  interface FastifyInstance {
    config: {
      PORT: number;
      HOST: string;
      CORS_ORIGIN: string;
      DATABASE_URL?: string;
      CLERK_PUBLISHABLE_KEY: string;
      CLERK_SECRET_KEY: string;
      CLERK_WEBHOOK_SECRET: string;
    };
  }

  interface FastifyRequest {
    user?: {
      userId: string;
      sessionId?: string;
    };
    rawBody?: string;
  }
}

