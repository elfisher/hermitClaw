# ---- Build Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma/ ./prisma/
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ---- Production Stage ----
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
# Skip postinstall (prisma generate) — client is copied from builder below
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Copy Prisma schema + pre-generated client from builder
COPY prisma/ ./prisma/
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

CMD ["node", "dist/index.js"]
