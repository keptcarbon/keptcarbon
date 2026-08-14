# ── Stage 1: build ────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

ARG NEXT_PUBLIC_BACKEND_API_URL
ENV NEXT_PUBLIC_BACKEND_API_URL=$NEXT_PUBLIC_BACKEND_API_URL

ARG NEXT_PUBLIC_ENABLE_PASSWORD_RESET
ENV NEXT_PUBLIC_ENABLE_PASSWORD_RESET=$NEXT_PUBLIC_ENABLE_PASSWORD_RESET

# Server-side only (not NEXT_PUBLIC_) — read by next.config.ts's headers()
# and app/robots.ts at build time, never sent to the client bundle.
ARG ENABLE_NOINDEX
ENV ENABLE_NOINDEX=$ENABLE_NOINDEX

RUN npm run build

# ── Stage 2: production runtime ───────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy only the files Next needs to run
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
RUN node -e " \
  const fs = require('fs'); \
  const content = fs.readFileSync('server.js', 'utf8'); \
  const patch = \` \
const originalLog = console.log; \
console.log = function(...args) { \
  const newArgs = args.map(arg => { \
    if (typeof arg === 'string') { \
      return arg.replace(new RegExp('http://[a-zA-Z0-9_-]+:3000', 'g'), 'http://localhost:3000'); \
    } \
    return arg; \
  }); \
  originalLog.apply(console, newArgs); \
}; \
\`; \
  fs.writeFileSync('server.js', patch + '\\n' + content); \
"
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
