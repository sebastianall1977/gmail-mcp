# Use Node 22 slim for better compatibility with Smithery
FROM node:22-slim

WORKDIR /app

# Environment vars
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV MCP_CONFIG_DIR=/home/node/.gmail-mcp

# Create logging/config dir
RUN mkdir -p /home/node/.gmail-mcp && \
    chown -R node:node /home/node/.gmail-mcp && \
    chmod -R 755 /home/node/.gmail-mcp

# Install pnpm
RUN npm install -g pnpm

# Copy manifests first (leverage Docker layer caching)
COPY package.json pnpm-lock.yaml* ./

# Install dependencies (ignore lockfile mismatch for now)
RUN pnpm install --no-frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript → dist
RUN pnpm build

# Run as non-root user
USER node

# Default start command
CMD ["pnpm", "start"]
