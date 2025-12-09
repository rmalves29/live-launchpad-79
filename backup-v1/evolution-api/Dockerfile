FROM node:20-alpine

WORKDIR /evolution

# Instalar dependências do sistema
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Variáveis de ambiente para Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Clonar Evolution API
RUN apk add --no-cache git && \
    git clone https://github.com/EvolutionAPI/evolution-api.git . && \
    apk del git

# Instalar dependências
RUN npm install

# Expor porta
EXPOSE 8080

# Comando de start
CMD ["npm", "run", "start:prod"]
