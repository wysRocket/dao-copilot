# Use official Node.js image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and lock file
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy all source files
COPY . .

# Build frontend
RUN pnpm run build

# Expose default Electron port (if needed)
EXPOSE 5173

# Start Electron app (headless for container, or override in compose)
CMD ["pnpm", "start"]
