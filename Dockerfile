# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

COPY . .

RUN npm run build

# ---- Stage 2: Production ----
FROM node:20-alpine

WORKDIR /usr/src/app

ARG APPLICATION_PORT=5011

# Install tini - lightweight init system to reap zombie processes
RUN apk add --no-cache tini

# Install build tools needed by native dependencies (bcrypt)
RUN apk add --no-cache g++ make python3 py3-pip py3-xlsxwriter
RUN pip3 install asn1tools --break-system-packages

# Install Chromium for Puppeteer PDF generation
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

ENV CHROME_BIN="/usr/bin/chromium-browser" \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built application from builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN mkdir -p logs && chown -R appuser:appgroup logs
USER appuser

EXPOSE $APPLICATION_PORT

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${APPLICATION_PORT}/health || exit 1

# Use tini as PID 1 to properly reap zombie processes
ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "dist/main"]
