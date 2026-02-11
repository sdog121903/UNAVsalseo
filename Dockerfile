# ============================================================
# Stage 1: Install dependencies
# ============================================================
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install


# ============================================================
# Stage 2: Build the Next.js application
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Bring in deps from Stage 1
COPY --from=deps /app/node_modules ./node_modules

# Copy all source code (including .env.local — allowed by .dockerignore)
COPY . .

# Next.js reads NEXT_PUBLIC_* from .env.local at build time automatically.
# No ARG/ENV overrides needed.
RUN npm run build


# ============================================================
# Stage 3: Production image (minimal — no dev deps, no source)
# ============================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Don't run as root in production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy only what the standalone server needs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
