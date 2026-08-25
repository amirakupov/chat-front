# syntax=docker/dockerfile:1

# Three stages so that a change to app code does not re-run `npm ci`: the deps layer is keyed on
# package-lock.json alone. The runtime stage carries no npm, no sources and no devDependencies —
# only what `output: "standalone"` traced.

ARG NODE_VERSION=22-alpine

# ---------- deps: node_modules, cached on the lockfile ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# The BuildKit cache mount keeps ~/.npm between builds, so a lockfile change re-links rather than
# re-downloads. It never lands in a layer.
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---------- build: next build ----------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# public/ is empty and git does not store empty directories, so a CI checkout arrives without it
# and the COPY in the runner stage fails on a path that exists on every developer's machine.
# Creating it here keeps both cases working — and still copies real assets once there are any.
RUN mkdir -p /app/public

# NEXT_PUBLIC_* is inlined into the client bundle at build time (lib/api.ts reads it at module
# scope), so this is a build arg, not a runtime env var: setting it on `docker run` changes
# nothing. A different backend means a different image.
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN --mount=type=cache,target=/app/.next/cache npm run build

# ---------- runner ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Port 3000 is not a preference: the backend's app.cors.allowed-origins hardcodes
# http://localhost:3000, and HOSTNAME must be 0.0.0.0 or the server binds inside the container only.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# server.js does not serve public/ or .next/static on its own — they are copied in next to it.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]