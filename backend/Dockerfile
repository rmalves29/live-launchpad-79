# ==================================
# ORDERZAP BACKEND - DOCKERFILE
# Node.js + Express + Baileys (WhatsApp)
# ==================================

FROM node:18-alpine

# Instalar dependências do sistema para Baileys
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production && \
    npm cache clean --force

# Copiar código fonte
COPY . .

# Criar diretório para sessões do WhatsApp
RUN mkdir -p /app/whatsapp-sessions && \
    chown -R node:node /app/whatsapp-sessions

# Usar usuário não-root
USER node

# Expor porta
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Comando para iniciar
CMD ["npm", "start"]
