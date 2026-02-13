# Build client (Vite)
FROM node:22-alpine AS build
WORKDIR /repo

# Enable pnpm
RUN corepack enable

# Copy workspace manifests first (better layer caching)
COPY package.json pnpm-workspace.yaml ./
COPY apps/client/package.json ./apps/client/package.json

RUN pnpm install --frozen-lockfile=false

# Copy the rest of the repo and build the client
COPY . .
RUN pnpm -C apps/client build

# Serve static
FROM nginx:1.27-alpine
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/client/dist /usr/share/nginx/html
EXPOSE 80
