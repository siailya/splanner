FROM node:24-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 needs node-gyp when no matching prebuilt binary is available.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g bun@1.3.14
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3101 DB_PATH=/data/planner.sqlite
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3101
CMD ["node", ".output/server/index.mjs"]
