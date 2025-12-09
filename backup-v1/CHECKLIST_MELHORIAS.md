# 🚀 Checklist de Melhorias - Servidor WhatsApp

Este documento apresenta o **plano de ação rápido** para otimizar e resolver problemas com o servidor WhatsApp.

---

## ✅ 1. Atualizar whatsapp-web.js e puppeteer

### Opção A: Usar puppeteer padrão (recomendado)

```batch
npm uninstall whatsapp-web.js puppeteer
npm cache clean --force
npm install whatsapp-web.js@latest
npm install puppeteer@latest
```

### Opção B: Usar puppeteer-core + Chrome do sistema

```batch
npm uninstall puppeteer
npm install puppeteer-core
```

**Vantagens:**
- Usa o Chrome já instalado no sistema
- Não precisa baixar Chromium (~300MB)
- Mais rápido de instalar

**Desvantagens:**
- Precisa configurar `executablePath` no código
- Requer Chrome/Chromium instalado no sistema

**Configuração necessária (se usar puppeteer-core):**

```javascript
puppeteer: {
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Windows
  // executablePath: '/usr/bin/google-chrome', // Linux
  headless: 'new',
  args: [...]
}
```

---

## ✅ 2. Adicionar flags recomendadas e headless: 'new'

**Status:** ✅ Já implementado em `server-multitenant-clean.js`

Flags otimizadas configuradas:
- `headless: 'new'` (modo headless moderno)
- `--no-sandbox` (necessário para alguns ambientes)
- `--disable-setuid-sandbox` (segurança alternativa)
- `--disable-dev-shm-usage` (reduz uso de memória compartilhada)
- `--disable-accelerated-2d-canvas` (compatibilidade)
- `--no-first-run` (pula configuração inicial)
- `--no-zygote` (Linux: evita processos zumbis)
- `--disable-gpu` (ambientes sem GPU)
- `--disable-software-rasterizer` (performance)
- `--disable-web-security` (necessário para WhatsApp Web)
- `--disable-features=IsolateOrigins,site-isolation-trials` (compatibilidade)

---

## ✅ 3. Criar script de teste rápido

**Status:** ✅ Criado `check-whatsapp.js`

### Como usar:

```batch
# Windows
node check-whatsapp.js

# Linux/Mac
node check-whatsapp.js
```

**O que o script faz:**
- Testa a conexão WhatsApp isoladamente
- Mostra diagnóstico detalhado de cada etapa
- Identifica onde exatamente o problema está ocorrendo
- Fornece soluções específicas para cada tipo de erro
- Limpa a sessão de teste automaticamente

**Quando usar:**
- Antes de rodar o servidor completo
- Para diagnosticar problemas de conexão
- Depois de atualizar dependências
- Para testar configurações

---

## ✅ 4. Instalar libs do SO (Linux) e liberar firewall/DNS

### Linux: Instalar dependências do Chromium

```bash
sudo apt-get update

sudo apt-get install -y \
  gconf-service \
  libasound2 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgcc1 \
  libgconf-2-4 \
  libgdk-pixbuf2.0-0 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  ca-certificates \
  fonts-liberation \
  libappindicator1 \
  libnss3 \
  lsb-release \
  xdg-utils \
  wget
```

### Windows: Liberar Firewall

1. **Windows Defender Firewall:**
   - Configurações > Atualização e Segurança > Segurança do Windows
   - Firewall e proteção de rede
   - Permitir aplicativo pelo firewall
   - Adicionar `node.exe`

2. **Desativar antivírus temporariamente** (apenas para teste)

### Testar conectividade:

```batch
# Windows
testar-conectividade.bat

# Linux/Mac
ping web.whatsapp.com
curl -I https://web.whatsapp.com
nslookup web.whatsapp.com
```

**Respostas esperadas:**
- Ping: deve responder (alguns servidores podem bloquear ICMP)
- Curl: deve retornar `HTTP/2 200` ou `HTTP/1.1 200`
- NSLookup: deve resolver o IP

**Se falhar:**
- Verificar proxy corporativo
- Desconectar VPN
- Verificar DNS (usar 8.8.8.8 ou 1.1.1.1)
- Verificar firewall de rede

---

## ✅ 5. Limpar sessão (.wwebjs_auth) se necessário

### Windows:

```batch
# Parar servidor
CTRL + C

# Limpar sessão
rmdir /s /q .wwebjs_auth_clean

# Reiniciar
start-clean.bat
```

### Linux/Mac:

```bash
# Parar servidor
CTRL + C

# Limpar sessão
rm -rf .wwebjs_auth_clean

# Reiniciar
./start-clean.sh
```

**Quando limpar a sessão:**
- Após atualizar whatsapp-web.js ou puppeteer
- Se o QR Code não aparecer
- Se a autenticação falhar repetidamente
- Se houver erros de "session corrupted"
- Se o WhatsApp desconectar sem motivo aparente

---

## ✅ 6. Ativar DEBUG para logs detalhados

### Windows:

```batch
# Modo debug completo
set DEBUG=whatsapp-web.js:*,puppeteer:*
node server-multitenant-clean.js

# Ou apenas whatsapp-web.js
set DEBUG=whatsapp-web.js:*
node server-multitenant-clean.js

# Ou apenas puppeteer
set DEBUG=puppeteer:*
node server-multitenant-clean.js
```

### Linux/Mac:

```bash
# Modo debug completo
DEBUG=whatsapp-web.js:*,puppeteer:* node server-multitenant-clean.js

# Ou apenas whatsapp-web.js
DEBUG=whatsapp-web.js:* node server-multitenant-clean.js

# Ou apenas puppeteer
DEBUG=puppeteer:* node server-multitenant-clean.js
```

**Logs úteis para diagnóstico:**
- `whatsapp-web.js:*` - eventos e erros do WhatsApp
- `puppeteer:*` - comunicação com o Chrome
- `puppeteer:protocol` - comandos DevTools Protocol
- `puppeteer:session` - gerenciamento de sessão

**Salvar logs em arquivo:**

```batch
# Windows
node server-multitenant-clean.js > logs.txt 2>&1

# Linux/Mac
node server-multitenant-clean.js 2>&1 | tee logs.txt
```

---

## ✅ 7. Teste de conectividade com curl

### Testar WhatsApp Web:

```batch
# Windows (PowerShell)
Invoke-WebRequest -Uri "https://web.whatsapp.com" -Method Head

# Windows (CMD com curl)
curl -I https://web.whatsapp.com

# Linux/Mac
curl -I https://web.whatsapp.com
```

**Resposta esperada:**

```
HTTP/2 200
server: nginx
content-type: text/html; charset=UTF-8
...
```

### Testar Supabase:

```batch
curl -I https://hxtbsieodbtzgcvvkeqx.supabase.co
```

**Se NÃO responder:**

1. **Problema de DNS:**
   ```batch
   # Windows
   nslookup web.whatsapp.com
   
   # Se falhar, trocar DNS
   # Usar DNS público: 8.8.8.8 (Google) ou 1.1.1.1 (Cloudflare)
   ```

2. **Problema de proxy:**
   ```batch
   # Windows
   netsh winhttp show proxy
   
   # Remover proxy temporariamente
   netsh winhttp reset proxy
   ```

3. **Problema de rede corporativa:**
   - Solicitar liberação da URL `web.whatsapp.com` no firewall
   - Adicionar exceção no proxy corporativo
   - Usar rede alternativa (4G/5G) para teste

---

## 📋 Ordem de Execução Recomendada

### 🔥 Primeira Tentativa (Solução Rápida):

1. Execute: `reinstalar-completo.bat` (Windows) ou script equivalente
2. Limpe sessão: `rmdir /s /q .wwebjs_auth_clean`
3. Execute teste: `node check-whatsapp.js`
4. Se OK, execute: `start-clean.bat`

### 🛠️ Se a Primeira Tentativa Falhar:

1. Execute: `testar-conectividade.bat`
2. Se conectividade OK:
   - Desative antivírus temporariamente
   - Execute: `node check-whatsapp.js` novamente
3. Se conectividade FALHA:
   - Libere firewall
   - Configure DNS público (8.8.8.8)
   - Desconecte VPN
   - Execute: `node check-whatsapp.js`

### 🐛 Modo Debug (Para Análise Profunda):

1. Windows:
   ```batch
   set DEBUG=whatsapp-web.js:*,puppeteer:*
   node check-whatsapp.js > debug-log.txt 2>&1
   ```

2. Linux:
   ```bash
   DEBUG=whatsapp-web.js:*,puppeteer:* node check-whatsapp.js 2>&1 | tee debug-log.txt
   ```

3. Analise o arquivo `debug-log.txt` para identificar o ponto exato da falha

---

## 🎯 Checklist Final

Marque ✅ conforme executar cada item:

- [ ] 1. Atualizar whatsapp-web.js e puppeteer
- [ ] 2. Verificar flags recomendadas no código
- [ ] 3. Executar `check-whatsapp.js` para teste isolado
- [ ] 4. (Linux) Instalar dependências do sistema
- [ ] 4. (Windows) Liberar firewall/antivírus
- [ ] 5. Testar conectividade com curl
- [ ] 6. Limpar sessão antiga
- [ ] 7. (Opcional) Ativar modo DEBUG
- [ ] 8. Executar servidor completo

---

## 📞 Arquivos de Referência

- **`check-whatsapp.js`** - Teste rápido de conexão
- **`reinstalar-completo.bat`** - Reinstalação limpa
- **`testar-conectividade.bat`** - Teste de rede
- **`DIAGNOSTICO_PUPPETEER.md`** - Soluções para problemas com Puppeteer
- **`TROUBLESHOOTING.md`** - Soluções gerais
- **`server-multitenant-clean.js`** - Servidor otimizado

---

## 🆘 Solução de Últimos Recursos

Se **NADA** funcionar no ambiente atual:

### Opção 1: Servidor em Nuvem

Deploy em:
- **Railway.app** (recomendado - fácil deploy)
- **Render.com** (free tier disponível)
- **DigitalOcean** (mais controle, pago)
- **AWS EC2** (mais poderoso, complexo)

Vantagens:
- Ambiente Linux otimizado
- Sem problemas de antivírus/firewall
- Sempre online (uptime 24/7)
- IP fixo e estável

### Opção 2: WSL2 (Windows Subsystem for Linux)

Se estiver no Windows:

```powershell
# Instalar WSL2
wsl --install

# Instalar Ubuntu
wsl --install -d Ubuntu

# Dentro do WSL:
cd /mnt/c/seu-projeto
sudo apt-get update
sudo apt-get install nodejs npm
npm install
node check-whatsapp.js
```

Vantagens:
- Ambiente Linux nativo no Windows
- Melhor compatibilidade com Puppeteer
- Evita problemas de firewall do Windows

### Opção 3: Docker

```dockerfile
FROM node:18-slim

# Instalar dependências do Chromium
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

CMD ["node", "server-multitenant-clean.js"]
```

---

## 🎓 Comandos Úteis para Diagnóstico

### Verificar instalação do Puppeteer:

```bash
node -e "const p = require('puppeteer'); console.log(p.executablePath())"
```

### Verificar versões:

```bash
node --version
npm --version
npm list whatsapp-web.js
npm list puppeteer
```

### Verificar processos Node.js:

```batch
# Windows
tasklist | findstr node.exe

# Linux
ps aux | grep node
```

### Matar todos os processos Node.js:

```batch
# Windows
taskkill /F /IM node.exe

# Linux
killall node
```

### Verificar porta 3333:

```batch
# Windows
netstat -ano | findstr :3333

# Linux
lsof -i :3333
```

---

## ✅ Sucesso!

Se você chegou até aqui e tudo está funcionando:

1. ✅ Servidor conectado
2. ✅ QR Code escaneado
3. ✅ Status: `online`
4. ✅ Mensagens sendo enviadas

**Parabéns! 🎉 Seu servidor WhatsApp está rodando perfeitamente!**

---

## 📚 Documentação Adicional

- [whatsapp-web.js Docs](https://wwebjs.dev/)
- [Puppeteer Docs](https://pptr.dev/)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [Diagnóstico Puppeteer](./DIAGNOSTICO_PUPPETEER.md)
