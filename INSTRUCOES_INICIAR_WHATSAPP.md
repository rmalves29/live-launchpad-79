# 🚀 Como Iniciar o Servidor WhatsApp Individual

## ⚠️ PROBLEMA COMUM: "Servidor WhatsApp offline"

Se você está vendo o erro **"Servidor WhatsApp offline. Não foi possível conectar em http://localhost:3333"**, é porque:

1. ❌ O servidor Node.js **NÃO está rodando**
2. ❌ Ou a URL não está configurada no banco de dados

---

## ✅ SOLUÇÃO PASSO A PASSO

### 1️⃣ Iniciar o Servidor Node.js

**Windows:**
```batch
start-empresa1.bat
```

**Linux/Mac:**
```bash
chmod +x start-empresa1.sh
./start-empresa1.sh
```

Você verá algo assim:
```
================================================
  WhatsApp Server - MANIA DE MULHER
================================================

🏢 Empresa: Mania de Mulher
🔌 Porta: 3333
🆔 Tenant: 08f2b1b9-3988-489e-8186-c60f0c0b0622

🚀 Iniciando servidor...
🌐 Acesse: http://localhost:3333
```

**⚠️ IMPORTANTE:** Deixe esta janela **ABERTA** rodando. Se você fechar, o WhatsApp desconecta.

---

### 2️⃣ Acessar a Página de Conexão

Abra o navegador e acesse:
```
http://localhost:3333
```

Você verá uma página com:
- Status da conexão
- QR Code (se ainda não conectou)
- Instruções de como escanear

---

### 3️⃣ Escanear QR Code

1. Abra o **WhatsApp** no seu celular
2. Toque em **⋮ Mais opções** (ou **Configurações**)
3. Toque em **"Aparelhos conectados"**
4. Toque em **"Conectar um aparelho"**
5. **Aponte** seu celular para o QR Code na tela
6. Aguarde a mensagem: **"✅ WhatsApp CONECTADO e PRONTO!"**

---

### 4️⃣ Verificar Configuração no Banco de Dados

O sistema precisa saber onde está o servidor WhatsApp. Execute este SQL no Supabase:

```sql
-- Verificar se já existe configuração
SELECT * FROM integration_whatsapp 
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';

-- Se NÃO existir, criar:
INSERT INTO integration_whatsapp (tenant_id, api_url, is_active)
VALUES (
  '08f2b1b9-3988-489e-8186-c60f0c0b0622',
  'http://localhost:3333',
  true
);

-- Se já existir mas a URL está errada, atualizar:
UPDATE integration_whatsapp
SET 
  api_url = 'http://localhost:3333',
  is_active = true,
  updated_at = now()
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';
```

---

### 5️⃣ Testar no Sistema Web

1. Acesse seu sistema web (frontend React)
2. Vá até a página de **Pedidos** ou **Mensagens**
3. Tente enviar uma mensagem de teste
4. Você deve ver: **"✅ Mensagem enviada com sucesso"**

---

## 🔍 Verificação Automática

Execute este script para verificar tudo automaticamente:

**Windows:**
```batch
verificar-config-whatsapp.bat
```

Este script vai:
- ✅ Verificar se Node.js está instalado
- ✅ Verificar se o servidor está rodando
- ✅ Testar a conexão
- ✅ Mostrar o status atual

---

## 🐛 Problemas Comuns

### ❌ "Porta 3333 já está em uso"

**Causa:** Já tem um servidor rodando na porta 3333

**Solução:**
```batch
# Windows - Matar processo na porta 3333
netstat -ano | findstr :3333
taskkill /PID <PID_DO_PROCESSO> /F

# Linux/Mac
lsof -ti:3333 | xargs kill -9
```

### ❌ QR Code expira muito rápido

**Causa:** Problemas de conexão com WhatsApp Web

**Solução:**
1. Limpe a sessão antiga:
   ```batch
   rmdir /s /q C:\ProgramData\OrderZaps
   ```
2. Reinicie o servidor
3. Tente escanear mais rápido

### ❌ "Could not find Chromium"

**Causa:** Puppeteer não consegue baixar o Chrome

**Solução:**
```batch
npm uninstall puppeteer
npm install puppeteer@21.0.0
```

---

## 📊 Checklist de Verificação

Antes de pedir ajuda, verifique:

- [ ] Node.js v18+ está instalado?
- [ ] Executou `start-empresa1.bat`?
- [ ] A janela do Node.js está **aberta** e rodando?
- [ ] Consegue acessar `http://localhost:3333` no navegador?
- [ ] O QR Code aparece na página?
- [ ] Escaneou o QR Code com o WhatsApp?
- [ ] Viu a mensagem "✅ WhatsApp CONECTADO e PRONTO"?
- [ ] A URL está configurada no banco (`integration_whatsapp`)?
- [ ] O `tenant_id` está correto na configuração?

---

## 🆘 Ainda não funciona?

Se seguiu todos os passos e ainda não funciona:

1. **Tire um print** da tela do terminal Node.js
2. **Tire um print** do erro no navegador
3. **Copie** as últimas linhas do log do terminal
4. **Verifique** a tabela `integration_whatsapp` no Supabase

---

## 🎯 Resumo Rápido

```bash
# 1. Iniciar servidor
start-empresa1.bat

# 2. Abrir navegador
http://localhost:3333

# 3. Escanear QR Code

# 4. Verificar banco de dados (Supabase SQL Editor)
SELECT * FROM integration_whatsapp WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';

# 5. Testar no sistema web
```

**Lembre-se:** O servidor Node.js precisa estar **sempre rodando** para o WhatsApp funcionar! 🚀
