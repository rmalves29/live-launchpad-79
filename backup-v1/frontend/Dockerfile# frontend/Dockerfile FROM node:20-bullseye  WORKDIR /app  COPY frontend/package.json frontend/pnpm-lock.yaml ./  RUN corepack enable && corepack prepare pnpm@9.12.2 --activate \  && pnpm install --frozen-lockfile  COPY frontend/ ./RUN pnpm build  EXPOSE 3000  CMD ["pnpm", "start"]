# frontend/Dockerfile
FROM node:20-bullseye

WORKDIR /app

COPY frontend/package.json frontend/pnpm-lock.yaml ./

RUN corepack enable && corepack prepare pnpm@9.12.2 --activate \
 && pnpm install --frozen-lockfile

COPY frontend/ ./

RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]
