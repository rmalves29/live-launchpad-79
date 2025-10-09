# 🔧 SOLUÇÃO: Timeout do QR Code

## ⚠️ Problema
O servidor inicia mas o QR Code não aparece, dando TIMEOUT após 60-90 segundos.

## 🎯 Causas Principais
1. **Multi-tenant simultâneo**: Múltiplos tenants tentando inicializar ao mesmo tempo sobrecarregam o Chromium
2. **Falta de memória RAM**: O Puppeteer precisa de recursos para cada instância do Chrome
3. **Antivírus bloqueando**: Windows Defender ou outros antivírus podem bloquear o Chromium

---

## ✅ SOLUÇÃO IMPLEMENTADA (v2.1)

### Melhorias Automáticas
- ✅ **Inicialização sequencial**: Tenants agora inicializam um por vez com delay de 5s
- ✅ **Timeout aumentado**: 90 segundos para dar mais tempo no Windows
- ✅ **Menos sobrecarga**: Chromium não é iniciado simultaneamente

### Passo 1: Reiniciar o Servidor
```cmd
# Feche o servidor atual (CTRL+C)
# Inicie novamente
node server1.js
```

**O que você vai ver:**
- ✅ Cada tenant inicia com 5 segundos de intervalo
- ✅ "Aguardando 5s antes do próximo tenant..."
- ✅ QR Code aparece para cada tenant sequencialmente

### Passo 1: Fechar Chrome
```
1. Abra o Gerenciador de Tarefas (CTRL + SHIFT + ESC)
2. Procure por "Chrome" ou "Google Chrome"
3. Finalize TODOS os processos Chrome
4. Feche o Gerenciador de Tarefas
```

### Passo 2: Limpar e Reinstalar
```cmd
reinstalar-puppeteer.bat
```

**Aguarde** - Pode levar 2-5 minutos para baixar o Chromium!

### Passo 3: Testar com 1 Tenant (Browser Visível)
```cmd
node server-simples-1-tenant.js
```

**O que deve acontecer:**
- ✅ Uma janela do Chrome VAI ABRIR (isso é normal!)
- ✅ Você verá o WhatsApp Web carregando
- ✅ O QR Code vai aparecer NO TERMINAL e NA TELA
- ✅ Escaneie o QR Code com seu WhatsApp

**Se isso funcionar**, o problema era multi-tenant. Prossiga para Passo 4.

**Se NÃO funcionar**, veja "Problemas Avançados" abaixo.

### Passo 4: Usar Servidor Completo
Se o Passo 3 funcionou, agora use o servidor completo:

```cmd
limpar-sessoes.bat
start-windows.bat
```

---

## 🔍 Problemas Avançados

### Erro: "Failed to launch browser"

**Causa:** Chromium não está instalado corretamente

**Solução:**
```cmd
cd node_modules\puppeteer
node install.js
cd ..\..
```

### Erro: "Target closed" ou "Session closed"

**Causa:** Sessão corrompida

**Solução:**
```cmd
rmdir /s /q .wwebjs_auth_v2
rmdir /s /q .wwebjs_auth_simple
```

### Antivírus Bloqueando

**Windows Defender:**
1. Abra "Segurança do Windows"
2. Vá em "Proteção contra vírus e ameaças"
3. "Gerenciar configurações"
4. Role até "Exclusões"
5. Adicione a pasta do projeto

**Outros Antivírus:**
- Avast/AVG: Adicione exceção em "Proteção de Arquivos"
- Norton: Configurações > Antivírus > Exclusões
- Kaspersky: Configurações > Exclusões

### Chrome Travando Sempre

**Opção 1:** Usar Chrome Instalado
Edite `server-simples-1-tenant.js` e adicione:

```javascript
puppeteer: {
  headless: false,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // ← Adicione esta linha
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox'
  ]
}
```

**Opção 2:** Aumentar Memória Node.js
```cmd
node --max-old-space-size=4096 server-simples-1-tenant.js
```

---

## 🧪 Testando Passo a Passo

Execute estes comandos em ordem e AGUARDE cada um terminar:

```cmd
# 1. Limpar tudo
limpar-sessoes.bat

# 2. Reinstalar (AGUARDE 2-5 minutos!)
reinstalar-puppeteer.bat

# 3. Testar simples (browser visível)
node server-simples-1-tenant.js
```

**Se o Passo 3 funcionar:**
```cmd
# 4. Usar servidor completo
node server1.js
```

---

## 📊 Verificar Status

Enquanto o servidor roda, abra outro terminal:

```cmd
# Ver status
curl http://localhost:3333/status

# Ver health
curl http://localhost:3333/health
```

---

## 🆘 Ainda com Problemas?

1. **Rode como Administrador:**
   - Clique direito no terminal
   - "Executar como Administrador"
   - Execute os comandos novamente

2. **Desabilite Antivírus Temporariamente:**
   - Para testar se é o antivírus
   - Se funcionar, adicione exceção (veja acima)

3. **Verifique Memória RAM:**
   - Feche outros programas
   - Chrome precisa de pelo menos 2GB livres

4. **Tente Outra Pasta:**
   - O caminho pode estar muito longo
   - Mova o projeto para `C:\whatsapp`

---

## ✅ Checklist de Verificação

- [ ] Chrome fechado (Gerenciador de Tarefas)
- [ ] `node_modules` reinstalado
- [ ] Sessões antigas removidas
- [ ] `server-simples-1-tenant.js` funcionou
- [ ] QR Code apareceu no terminal
- [ ] Browser abriu corretamente
- [ ] Antivírus não está bloqueando
- [ ] Tem pelo menos 2GB RAM livre

Se TODOS estiverem ✅ e ainda não funcionar, o problema pode ser:
- Windows muito antigo (requer Windows 10/11)
- Node.js muito antigo (requer Node 16+)
- Rede bloqueando WhatsApp Web
