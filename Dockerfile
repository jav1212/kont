# syntax=docker/dockerfile:1

# Next 16 requires Node >= 20.9. Corepack still ships with Node 22.
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# package.json has no "packageManager" field, so pin pnpm here for reproducible
# builds. pnpm-workspace.yaml's allowBuilds requires a recent pnpm 10.
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

# ---------- manifests ----------
# Reduces the context to lockfile and package.json files, so the install layer
# stays cached until dependencies change and no list of the nested workspace
# packages has to be maintained here.
FROM base AS manifests
WORKDIR /app
COPY . .
RUN find . -type f ! -name package.json ! -name pnpm-lock.yaml ! -name pnpm-workspace.yaml -delete \
    && find . -type d -empty -delete

# ---------- deps ----------
FROM base AS deps
WORKDIR /app
# The filter already keeps Electron out; this is a guard if it ever leaks in.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY --from=manifests /app ./
# "{.}..." selects the root Web app and its workspace dependencies only.
# --prod=false keeps the build toolchain if the platform sets NODE_ENV=production.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod=false --filter "{.}..." --store-dir /pnpm/store

# ---------- build ----------
# Extends deps instead of copying /app/node_modules: pnpm also creates a
# node_modules inside each workspace package and module resolution needs them.
FROM deps AS builder
COPY . .

# Public variables are inlined into the bundles by next build. ARG without ENV on
# purpose: an unset ARG stays undefined, while ENV X=$X would define an empty
# string and defeat the `process.env.X ?? fallback` defaults used by the code.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
ARG NEXT_PUBLIC_DEVICE_MANAGER_URL
ARG NEXT_PUBLIC_DEVICE_MANAGER_DOWNLOAD_URL

ENV NEXT_TELEMETRY_DISABLED=1
# Default heap on a small server may be too low for the webpack production build.
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN pnpm run build

# ---------- runtime ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs

# public comes from the builder because Serwist generates sw.js during the build.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
