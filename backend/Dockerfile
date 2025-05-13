# Use official Node.js image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json tsconfig.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm install -D typescript && npm run build

# Expose port
EXPOSE 4000

# Start server
CMD ["node", "dist/index.js"]
