# Production Dockerfile for IDHAM ERP Backend API
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN npm install
RUN npm run build -w @idham/api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/db ./apps/api/db

EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
