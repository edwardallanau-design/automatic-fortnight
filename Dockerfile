# syntax=docker/dockerfile:1

# ---- deps: install node modules (bcrypt needs a build toolchain) ----
FROM node:24-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: generate prisma client + next standalone build ----
FROM node:24-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prisma.config.ts validates DATABASE_URL at config-load time even for `generate`,
# which itself never connects to a database. Supply a placeholder so the client
# can be generated without a live DB; the real URL is provided at runtime.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate
RUN npm run build

# ---- runner: minimal image that serves the standalone build ----
FROM node:24-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# non-root user
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# standalone server + static assets + public dir
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# prisma schema/migrations/seed + full node_modules (for migrate/seed/tsx/bcrypt)
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

COPY docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker/entrypoint.sh"]
