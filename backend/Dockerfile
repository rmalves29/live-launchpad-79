# Use Node.js 22 LTS
FROM node:22-slim

# Install git for npm packages that need it
RUN apt-get update && apt-get install -y \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package.json
COPY package.json ./

# Install dependencies
RUN npm install --legacy-peer-deps --production

# Copy all backend files
COPY . .

# Create directory for Baileys authentication
RUN mkdir -p .baileys_auth && chmod 777 .baileys_auth

# Expose port (Railway uses PORT env var, defaults to 8080)
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
