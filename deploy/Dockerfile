FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM build AS runtime
ENV NODE_ENV=production
RUN mkdir -p /app/apps/api/.data && chown -R node:node /app
USER node
WORKDIR /app/apps/api
EXPOSE 3200 3100
CMD ["node","dist/main.js"]
