# 🚀 Como Reiniciar o Servidor WhatsApp

## ✅ Melhorias Implementadas (v2.2)

O servidor agora inicializa os tenants **sequencialmente** para evitar sobrecarga:
- ⏱️ Delay de **20 segundos** entre cada tenant (aumentado!)
- 🕐 Timeout aumentado para **120 segundos** (2 minutos)
- 🔄 Muito menos chance de conflitos e timeouts
- 📊 Logs detalhados com progresso visual

---

## 📋 Passos para Reiniciar

### 1️⃣ Fechar o Servidor Atual
```cmd
# Pressione CTRL + C no terminal onde o servidor está rodando
```

### 2️⃣ (Opcional) Limpar Sessões Antigas
```cmd
# Se tiver problemas, limpe as sessões antigas primeiro
limpar-sessoes.bat
```

### 3️⃣ Iniciar o Servidor
```cmd
node server1.js
```

---

## 📺 O Que Você Vai Ver

### Inicialização Normal (ESPERADO):
```
🚀 WhatsApp Server v2.0
✅ Servidor online: http://localhost:3333
📊 Status: http://localhost:3333/status

🏢 Carregando tenants...
📋 2 tenant(s) ativo(s)
⏱️ Inicializando tenants SEQUENCIALMENTE com delay de 20s entre cada...
⚠️ IMPORTANTE: Aguarde cada tenant conectar antes do próximo iniciar

======================================================================
🔧 [1/2] Inicializando: MANIA DE MULHER
======================================================================

🔄 Iniciando WhatsApp Web para: MANIA DE MULHER...
⏰ Aguarde o QR Code aparecer (pode levar até 120 segundos)...
💡 Se demorar muito, feche outros programas para liberar memória

📱 QR CODE GERADO - MANIA DE MULHER
[QR Code aqui]

⏳ Aguardando 20 segundos antes do próximo tenant...
💡 Isso evita sobrecarga de memória e garante estabilidade

======================================================================
🔧 [2/2] Inicializando: teste
======================================================================

🔄 Iniciando WhatsApp Web para: teste...
⏰ Aguarde o QR Code aparecer (pode levar até 120 segundos)...

📱 QR CODE GERADO - teste
[QR Code aqui]

======================================================================
✅ Processo de inicialização concluído!
📊 Verifique o status em: http://localhost:3333/status
======================================================================
```

### ✅ Sucesso Final:
```
✅ WhatsApp conectado! - MANIA DE MULHER
✅ WhatsApp conectado! - teste
```

---

## ⚠️ Se Ainda Der Timeout

1. **Feche TODOS os Chrome abertos**
   - Gerenciador de Tarefas (CTRL+SHIFT+ESC)
   - Procure "Chrome" e finalize todos

2. **Reinicie o computador**
   - Isso libera memória e processos travados

3. **Reinstale o Puppeteer**
   ```cmd
   reinstalar-puppeteer.bat
   ```

4. **Use o modo debug (visualizar navegador)**
   ```cmd
   node server-debug-visual.js
   ```

---

## 📊 Verificar Status dos Tenants

Abra outro terminal enquanto o servidor roda:

```cmd
# Ver status de todos os tenants
curl http://localhost:3333/status

# Ver saúde geral do servidor
curl http://localhost:3333/health
```

**Resposta esperada (`/status`):**
```json
{
  "success": true,
  "tenants": {
    "08f2b1b9-3988-489e-8186-c60f0c0b0622": {
      "name": "MANIA DE MULHER",
      "status": "online"
    },
    "6b11ab5a-fcc2-4a6e-b0f0-b76a13cbd62f": {
      "name": "teste",
      "status": "online"
    }
  }
}
```

---

## 🔧 Comandos Úteis

```cmd
# Iniciar servidor normal
node server1.js

# Iniciar com browser visível (debug)
node server-debug-visual.js

# Verificar status
curl http://localhost:3333/status

# Limpar sessões antigas
limpar-sessoes.bat

# Reinstalar dependências
reinstalar-puppeteer.bat
```

---

## 📱 Escanear QR Codes

1. Abra o WhatsApp no celular
2. Vá em **Configurações > Aparelhos conectados**
3. Toque em **Conectar um aparelho**
4. Escaneie o QR Code que aparece no terminal
5. Aguarde a confirmação: ✅ WhatsApp conectado!

**Importante:** 
- Cada tenant precisa de um número diferente
- O QR Code expira em 60 segundos (será gerado um novo automaticamente)
- Se já estava conectado antes, pode conectar automaticamente sem QR Code

---

## 💡 Dicas

✅ **Funciona melhor quando:**
- Há pelo menos 4GB RAM livre
- Nenhum outro Chrome está aberto
- Antivírus tem exceção para a pasta do projeto
- Internet está estável

❌ **Pode dar problema se:**
- Muitos programas abertos (falta RAM)
- Antivírus bloqueando o Chromium
- Internet instável durante inicialização
- Pasta com caminho muito longo (Windows)
