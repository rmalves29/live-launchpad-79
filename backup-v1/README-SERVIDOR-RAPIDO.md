# 🚀 SERVIDOR WHATSAPP - INÍCIO RÁPIDO

## ⚡ Solução Mais Fácil (Windows)

**Clique duas vezes em um destes arquivos:**

### 1️⃣ `menu-servidor.bat` 
Menu interativo com todas as opções

### 2️⃣ `instalar-e-iniciar.bat`
Instala tudo e inicia automaticamente

### 3️⃣ `verificar-instalacao.bat`
Verifica se tudo está instalado corretamente

---

## 📋 Passo a Passo Manual

Se preferir fazer manualmente:

### 1. Instalar dependências

```bash
npm install whatsapp-web.js express cors qrcode-terminal node-fetch@2
```

### 2. Iniciar servidor

```bash
node server1.js
```

### 3. Escanear QR Code

Um QR Code aparecerá no terminal. Escaneie com o WhatsApp.

---

## ✅ Verificar se funcionou

Após conectar, abra outro terminal e execute:

```bash
curl http://localhost:3333/status/08f2b1b9-3988-489e-8186-c60f0c0b0622
```

Se retornar JSON com `"status": "online"`, está funcionando!

---

## ❌ Problemas Comuns

### "Client is not defined"
**Causa:** Dependências não instaladas  
**Solução:** Execute `instalar-e-iniciar.bat` ou o comando de instalação manual

### "Chrome not found"
**Causa:** Chrome não está instalado  
**Solução:** Instale o Google Chrome de https://www.google.com/chrome/

### "Error: Cannot find module"
**Causa:** Executando no diretório errado  
**Solução:** Certifique-se de estar na pasta onde está o `server1.js`

### Servidor fecha sozinho
**Causa:** Erro durante inicialização  
**Solução:** Leia as mensagens de erro no terminal

---

## 🔧 Configuração Avançada

### Variável de Ambiente (Opcional)

Se quiser definir a chave do Supabase explicitamente:

```bash
# Windows PowerShell
$env:SUPABASE_SERVICE_ROLE_KEY="sua_chave_aqui"

# Windows CMD
set SUPABASE_SERVICE_ROLE_KEY=sua_chave_aqui
```

### Porta Customizada

```bash
# Windows PowerShell
$env:PORT=8080

# Windows CMD  
set PORT=8080
```

---

## 📊 Logs Detalhados

O servidor agora mostra logs detalhados de cada envio:

- 📨 Requisições recebidas
- 📞 Normalização de telefone
- 🔍 Status da conexão
- ⏱️ Tempo de execução
- ✅ Confirmações de sucesso
- ❌ Erros com stack trace completo

---

## 🌐 Produção

Para rodar em produção (servidor 24/7):

### Opção 1: PM2 (Recomendado)

```bash
npm install -g pm2
pm2 start server1.js --name whatsapp
pm2 save
pm2 startup
```

### Opção 2: Railway/Render

1. Faça deploy do `server1.js` no Railway/Render
2. Configure a secret `WHATSAPP_MULTITENANT_URL` no Supabase com a URL pública
3. Escaneie o QR Code nos logs da plataforma

---

## 📞 Suporte

Se nada funcionar:

1. Execute `verificar-instalacao.bat`
2. Tire um print dos erros no terminal
3. Verifique se Node.js e Chrome estão instalados
