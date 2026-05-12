FROM node:20-alpine

WORKDIR /app

# Copy package files and install ALL dependencies (including devDeps needed for build)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build-time env vars — Render passes these via the dashboard
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_WS_URL=ws://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

# Build
RUN npm run build

# Runtime
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
