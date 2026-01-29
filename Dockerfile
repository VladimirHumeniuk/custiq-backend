FROM node:20-bullseye-slim

ENV NODE_TLS_REJECT_UNAUTHORIZED=0

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
RUN npm config set strict-ssl false
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
RUN NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm prisma:generate
RUN pnpm build

EXPOSE 4001

CMD ["pnpm", "start"]

