# Email Queue Worker Dockerfile
# Multi-stage build for minimal production image

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Production image
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine

# Install wget for health checks
RUN apk add --no-cache wget

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy built files
COPY --from=builder /app/dist ./dist

# Expose health check port
EXPOSE 8080

# Health check using wget (more reliable in Alpine)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:8080/ready || exit 1

# Run as non-root for security
USER node

# Environment defaults
ENV NODE_ENV=production
ENV HEALTH_PORT=8080
ENV LOG_LEVEL=info

# Start the worker
CMD ["node", "dist/index.js"]
