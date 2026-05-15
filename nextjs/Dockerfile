FROM node:20-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the app
COPY . .

# Expose Next.js dev port
EXPOSE 3000

# Run in development mode
CMD ["sh", "-c", "if [ ! -f package.json ]; then echo 'Error: package.json not found in /app'; pwd; ls -la; exit 1; fi && npm run dev"]
