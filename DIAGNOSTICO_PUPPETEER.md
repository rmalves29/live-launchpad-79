# 🔧 Diagnóstico e Soluções - Puppeteer Travando

## 📋 Problema Identificado

O servidor Node.js **trava** em "Inicializando Puppeteer..." sem conseguir conectar ao WhatsApp Web.

**Causa raiz:** O Puppeteer não consegue baixar/inicializar o Chrome headless necessário para conectar ao WhatsApp Web.

---

## ✅ Soluções (tente na ordem)

### 🔥 SOLUÇÃO 1: Limpeza Completa + Reinstalação (RECOMENDADA)

```batch
REM 1. Pare o servidor (Ctrl+C no Node.js)

REM 2. Delete TUDO relacionado ao WhatsApp
rmdir /s /q .wwebjs_auth_clean
rmdir /s /q node_modules\.cache
rmdir /s /q node_modules\puppeteer
rmdir /s /q node_modules\whatsapp-web.js

REM 3. Limpe o cache do NPM
npm cache clean --force

REM 4. Reinstale as dependências ESPECÍFICAS
npm uninstall whatsapp-web.js puppeteer
npm install whatsapp-web.js@1.23.0
npm install puppeteer@21.0.0

REM 5. Reinicie o servidor
start-clean.bat
```

**Por que funciona:** Usa versões estáveis e testadas do whatsapp-web.js e puppeteer.

---

### 🛡️ SOLUÇÃO 2: Desabilitar Firewall/Antivírus Temporariamente

O Windows Defender ou antivírus pode estar **bloqueando** o Puppeteer de baixar o Chrome.

**Passos:**
1. Desabilite o Windows Defender temporariamente:
   - Configurações > Atualização e Segurança > Segurança do Windows
   - Proteção contra vírus e ameaças > Gerenciar configurações
   - Desative "Proteção em tempo real"

2. Desabilite antivírus de terceiros (se tiver)

3. Execute novamente:
   ```batch
   rmdir /s /q .wwebjs_auth_clean
   start-clean.bat
   ```

4. **Reative** a proteção depois de conectar

---

### 🌐 SOLUÇÃO 3: Verificar Proxy/VPN/Firewall Corporativo

Se estiver em rede corporativa ou usando VPN:

1. **Desconecte VPN** temporariamente
2. **Desabilite proxy** nas configurações do Windows
3. Tente novamente

**Teste de conectividade:**
```batch
REM Teste se consegue acessar os servidores do WhatsApp
ping web.whatsapp.com
curl -I https://web.whatsapp.com
```

Se não conseguir acessar, o problema é de **rede/firewall**.

---

### 🔧 SOLUÇÃO 4: Instalar Chrome Manualmente para Puppeteer

O Puppeteer pode não estar conseguindo baixar o Chrome. Vamos forçar a instalação:

```batch
REM 1. Instale o Chrome no sistema (se não tiver)
REM Baixe de: https://www.google.com/chrome/

REM 2. Configure o Puppeteer para usar o Chrome instalado
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
set PUPPETEER_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"

REM 3. Reinstale
npm uninstall puppeteer
npm install puppeteer-core

REM 4. Reinicie
start-clean.bat
```

---

### 🐛 SOLUÇÃO 5: Modo Debug - Ver o Que Está Acontecendo

Ative o modo headless=false para VER o Chrome abrindo:

**Edite `server-multitenant-clean.js` linha 112:**

```javascript
puppeteer: {
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: false,  // ← MUDE PARA false
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
```

Agora você vai **ver** o navegador Chrome abrindo e pode identificar o erro visual.

---

### 🔄 SOLUÇÃO 6: Usar Versão Alternativa (Última tentativa)

Se NADA funcionar, use uma versão mais antiga e estável:

```batch
npm uninstall whatsapp-web.js puppeteer
npm install whatsapp-web.js@1.21.0
npm install puppeteer@19.0.0
rmdir /s /q .wwebjs_auth_clean
start-clean.bat
```

---

## 🎯 Checklist de Verificação

Antes de tentar as soluções, verifique:

- [ ] Node.js está atualizado? (v16+ recomendado)
- [ ] Tem espaço em disco? (mínimo 2GB livres)
- [ ] Está rodando como Administrador?
- [ ] Tem internet estável?
- [ ] Windows está atualizado?
- [ ] Nenhum antivírus/firewall corporativo bloqueando?

---

## 📞 Status de Teste

Após cada solução, verifique:

1. **Terminal Node.js** deve mostrar:
   - ✅ "QR CODE GERADO" (sucesso!)
   - ❌ "Timeout" ou travado (tentar próxima solução)

2. **Frontend** em `http://localhost:3333/status` deve mostrar:
   - Status do tenant: `"online"` ou `"qr_code"`

---

## 🆘 Se NADA Funcionar

Considere usar um **servidor WhatsApp em nuvem**:
- Railway.app
- Render.com
- DigitalOcean Droplet

Muitas vezes o problema é o ambiente Windows que tem limitações com Puppeteer.
