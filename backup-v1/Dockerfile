# ==============================================================================
# DOCKERFILE PARA RAILWAY - ORDERZAP
# ==============================================================================
# Este Dockerfile resolve o erro: "/bin/bash: line 1: npm: command not found"
# 
# O que faz:
# 1. Stage 1 (builder): Builda o frontend React com Vite
# 2. Stage 2 (production): Copia frontend buildado + backend, roda servidor
# 
# Railway DEVE estar configurado:
# - Settings → Build → Builder: "Dockerfile" 
# - Settings → Build → Dockerfile Path: "Dockerfile"
# - Settings → Build → Root Directory: (vazio)
# ==============================================================================

# ==============================================================================
# STAGE 1: BUILD FRONTEND
# ==============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copiar apenas package files primeiro (melhor cache)
COPY package*.json ./

# Instalar TODAS as dependências (incluindo devDependencies para build)
RUN npm ci --include=dev

# Copiar código fonte completo
COPY . .

# Build do frontend com Vite
RUN npm run build

# Verificar se build foi bem-sucedido
RUN ls -la /app/dist && echo "✅ Frontend buildado com sucesso!"

# ==============================================================================
# STAGE 2: PRODUCTION
# ==============================================================================
FROM node:20-alpine

WORKDIR /app

# Copiar frontend buildado do stage anterior
COPY --from=frontend-builder /app/dist ./dist

# Copiar backend
COPY backend ./backend

# Copiar package files
COPY package*.json ./

# Instalar APENAS dependências de produção do backend
WORKDIR /app/backend
RUN npm ci --omit=dev

# Voltar para /app
WORKDIR /app

# Expor porta (Railway usa variável PORT automaticamente)
EXPOSE 3333

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3333) + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Iniciar servidor
CMD ["node", "backend/server-main.js"]
