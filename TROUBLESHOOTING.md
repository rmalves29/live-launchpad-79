# 🔧 Troubleshooting - WhatsApp Server

## ❌ Problema: QR Code não aparece (fica carregando)

### Causas comuns:

1. **Falta de dependências do Chromium (Linux)**
2. **Problema com Puppeteer**
3. **Timeout da conexão**
4. **Sessão antiga corrompida**

---

## 📋 Passo a Passo de Resolução

### 1️⃣ Verificar Dependências

```bash
chmod +x check-dependencies.sh
./check-dependencies.sh
```

**Se estiver no Linux e faltarem dependências:**
```bash
sudo apt-get update
sudo apt-get install -y \
  libgbm1 \
  libasound2 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libpango-1.0-0 \
  libcairo2 \
  libnss3 \
  fonts-liberation
```

### 2️⃣ Limpar Sessões Antigas

Se o servidor já foi executado antes, limpe as sessões:

```bash
rm -rf .wwebjs_auth_v2
rm -rf .wwebjs_auth_debug
```

### 3️⃣ Reinstalar Dependências

```bash
rm -rf node_modules
npm install
```

### 4️⃣ Teste em Modo Debug Visual

Execute o servidor com o navegador visível para ver o que está acontecendo:

```bash
node server-debug-visual.js
```

**O que deve acontecer:**
- Uma janela do Chrome/Chromium irá abrir
- Você verá o WhatsApp Web carregando
- O QR Code deve aparecer na tela
- O QR Code também deve aparecer no terminal

**Se o QR Code aparecer no navegador mas não no terminal:**
- O problema é apenas no `qrcode-terminal`
- O sistema está funcionando!
- Você pode escanear o QR direto do navegador

### 5️⃣ Teste em Modo Debug com Logs

```bash
chmod +x start-debug.sh
./start-debug.sh
```

Isso irá:
- Ativar logs detalhados do Puppeteer
- Salvar todos os logs em `whatsapp-debug.log`
- Mostrar exatamente onde está travando

### 6️⃣ Verificar Firewall/Antivírus

Certifique-se de que:
- Porta 3333 está liberada
- Chromium pode fazer conexões com `web.whatsapp.com`
- Nenhum antivírus está bloqueando o Puppeteer

---

## 🔍 Diagnóstico de Erros Comuns

### Erro: "Chromium revision is not downloaded"

**Solução:**
```bash
npx puppeteer browsers install chrome
```

### Erro: "Failed to launch the browser process"

**Solução 1 - Instalar dependências (Linux):**
```bash
sudo apt-get install -y chromium-browser
```

**Solução 2 - Usar Chrome existente:**
Edite o arquivo e adicione `executablePath`:
```javascript
puppeteer: {
  executablePath: '/usr/bin/google-chrome', // ou '/usr/bin/chromium-browser'
  headless: true,
  args: ['--no-sandbox']
}
```

### Erro: "Target closed" ou "Session closed"

**Causa:** Sessão antiga corrompida

**Solução:**
```bash
rm -rf .wwebjs_auth_v2
node server1.js
```

### QR Code aparece mas não conecta

**Possíveis causas:**
1. QR Code expirou (gera novo a cada 20 segundos)
2. WhatsApp já está conectado em outro lugar
3. Número de telefone não compatível

**Solução:**
- Aguarde novo QR Code ser gerado
- Desconecte outros dispositivos no WhatsApp
- Use um número válido do Brasil

---

## 📱 Testando a Conexão

Depois de conectado, teste os endpoints:

```bash
# Status geral
curl http://localhost:3333/status

# Health check
curl http://localhost:3333/health

# Enviar mensagem teste
curl -X POST http://localhost:3333/send \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "SEU_TENANT_ID",
    "phone": "5531999999999",
    "message": "Teste de conexão"
  }'
```

---

## 🆘 Ainda com Problemas?

1. **Verifique os logs:** `cat whatsapp-debug.log`
2. **Teste com apenas 1 tenant ativo** no banco de dados
3. **Reinicie o servidor** após qualquer mudança
4. **Verifique o console do navegador** (quando usar modo visual)

---

## 📞 Comandos Úteis

```bash
# Ver processos Node rodando
ps aux | grep node

# Matar processos Node
pkill -f node

# Ver portas em uso
netstat -tulpn | grep 3333

# Testar conectividade WhatsApp
curl -I https://web.whatsapp.com

# Limpar tudo e recomeçar
rm -rf node_modules .wwebjs_auth_v2
npm install
node server1.js
```

---

## ✅ Checklist Final

- [ ] Dependências do sistema instaladas
- [ ] Node.js e npm funcionando
- [ ] `node_modules` instalados
- [ ] Sessões antigas limpas
- [ ] Porta 3333 disponível
- [ ] Internet funcionando
- [ ] QR Code aparece no terminal
- [ ] WhatsApp pronto para escanear
- [ ] Tenant ativo no banco de dados
- [ ] Integração WhatsApp configurada

Se todos os itens estiverem ✅ mas ainda não funcionar, tente o modo debug visual.
