# 🚀 Guia do Servidor WhatsApp Estável v2.0

## ✨ Características

Este servidor foi desenvolvido com foco em **estabilidade e robustez**:

### 🔥 Principais Recursos

- ✅ **Sistema de Fila Inteligente** - Gerencia envio de mensagens automaticamente
- ✅ **Auto-Reconexão** - Reconecta automaticamente em caso de queda
- ✅ **Retry Automático** - Tenta novamente mensagens que falharam (até 3x)
- ✅ **Tratamento Robusto de Erros** - Não trava mesmo com erros inesperados
- ✅ **Logs Detalhados** - Acompanhe tudo que acontece em tempo real
- ✅ **Limpeza Automática** - Remove processos e arquivos travados ao iniciar
- ✅ **Graceful Shutdown** - Desliga de forma segura sem perder mensagens
- ✅ **Health Checks** - Monitore a saúde do servidor
- ✅ **Otimização de Performance** - Configurações ideais para produção

---

## 📋 Pré-requisitos

Certifique-se de ter instalado:

```bash
npm install whatsapp-web.js express cors qrcode-terminal
```

---

## 🚀 Como Iniciar

### Comando Direto

```bash
node server-whatsapp-stable.js
```

---

## 📱 Conectando o WhatsApp

1. Execute o servidor
2. Aguarde o QR Code aparecer no terminal
3. Abra o WhatsApp no celular
4. Vá em **Configurações → Aparelhos Conectados**
5. Clique em **Conectar um aparelho**
6. Escaneie o QR Code
7. Aguarde a mensagem: `✅ Cliente WhatsApp pronto para enviar mensagens!`

---

## 🔍 Monitoramento

### Ver Status no Terminal

O servidor exibe logs coloridos em tempo real:

- 🔍 **Debug** - Informações técnicas
- ℹ️  **Info** - Informações gerais
- ✅ **Success** - Operações bem-sucedidas
- ⚠️  **Warning** - Avisos importantes
- ❌ **Error** - Erros que precisam atenção

### Endpoints de Monitoramento

#### Health Check Simples
```bash
GET http://localhost:3333/status
```

#### Status Detalhado
```bash
GET http://localhost:3333/api/status
```

Resposta:
```json
{
  "success": true,
  "connected": true,
  "canSendMessages": true,
  "phone": "5511999999999",
  "name": "Meu WhatsApp",
  "queue": {
    "sent": 45,
    "failed": 2,
    "pending": 0
  }
}
```

---

## 📤 Enviando Mensagens

### 1. Mensagem Simples

```bash
POST http://localhost:3333/send

{
  "number": "5511999999999",
  "message": "Olá! Teste."
}
```

### 2. Produto Cancelado

```bash
POST http://localhost:3333/send-product-canceled

{
  "phone": "5511999999999",
  "product_name": "Camiseta Azul",
  "product_code": "CAM-001"
}
```

### 3. Broadcast (Envio em Massa)

```bash
POST http://localhost:3333/api/broadcast/by-phones

{
  "key": "whatsapp-broadcast-2024",
  "phones": ["5511999999999", "5511888888888"],
  "message": "Olá! Mensagem em massa."
}
```

---

## 🎯 Sistema de Fila

### Como Funciona

1. Mensagens são adicionadas à fila automaticamente
2. Processamento com intervalo de 2 segundos entre mensagens
3. Retry automático até 3 tentativas
4. Ordem garantida de envio

### Monitorar a Fila

```bash
GET http://localhost:3333/api/queue/stats
```

### Limpar a Fila

```bash
POST http://localhost:3333/api/queue/clear
```

---

## 🔄 Auto-Reconexão

O servidor reconecta automaticamente em caso de falha. Você verá:

```
⚠️  Cliente WhatsApp desconectado
Reconectando em 5s...
```

---

## ✅ Checklist

- [ ] Servidor inicia sem erros
- [ ] QR Code foi escaneado
- [ ] Status mostra "ready: true"
- [ ] Envio de teste funcionou

---

**🎉 Servidor Estável e Robusto v2.0 - Pronto para Produção!**
