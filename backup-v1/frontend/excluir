# Imagem base
FROM node:20-alpine

# Define diretório de trabalho
WORKDIR /app

# Copia arquivos de configuração
COPY package*.json ./

# Instala dependências
RUN npm ci

# Copia o restante do projeto
COPY . .

# Builda o projeto
RUN npm run build

# Usa Caddy como servidor de produção
RUN npm install -g caddy

EXPOSE 80
CMD ["npx", "caddy", "run", "--config", "Caddyfile", "--adapter", "caddyfile"]
