FROM node:20-alpine

WORKDIR /usr/src/app

ARG APPLICATION_PORT

# Install tini - lightweight init system to reap zombie processes
RUN apk add --no-cache tini

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install build tools needed by native dependencies
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

# Install production dependencies
RUN npm ci --omit=dev

# Copy source and build
COPY . /usr/src/app
RUN npm run build

EXPOSE $APPLICATION_PORT

# Use tini as PID 1 to properly reap zombie processes
ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "dist/main"]
