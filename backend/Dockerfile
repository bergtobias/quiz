# Use an official Node.js runtime as a base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install bash (optional, for scripts/debugging)
RUN apk add --no-cache bash

# Copy dependency files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy all source files
COPY . .

# Build the TypeScript files to JavaScript in dist/
RUN npm run build

# Expose the backend port
EXPOSE 3001

# Start the compiled server
CMD ["node", "dist/server.js"]
