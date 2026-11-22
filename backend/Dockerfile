# Build from the repo root: docker build -f backend/Dockerfile .
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
RUN npm ci --omit=dev -w backend -w packages/shared
COPY packages/shared packages/shared
COPY backend backend
WORKDIR /app/backend
ENV NODE_ENV=production
