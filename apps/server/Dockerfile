# Build server (TypeScript)
FROM node:22-alpine AS build
WORKDIR /repo

RUN corepack enable

# Copy workspace manifests first
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json ./apps/server/package.json

RUN pnpm install --frozen-lockfile=false

COPY . .
RUN pnpm -C apps/server build

# Runtime
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install prod deps for server only
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json ./apps/server/package.json
RUN pnpm install --prod --filter @jarvis-woodcutter-fps/server --frozen-lockfile=false

COPY --from=build /repo/apps/server/dist ./apps/server/dist
COPY --from=build /repo/apps/server/drizzle ./apps/server/drizzle

EXPOSE 3023
CMD ["node", "apps/server/dist/index.js"]
