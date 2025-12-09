# 🔄 Tratamento do Erro 515 (restartRequired) - Baileys

## ✅ Problema Resolvido!

O erro **515 (restartRequired)** é um código de desconexão normal do Baileys que indica que o WhatsApp está solicitando um restart da conexão.

## 🔍 O que significa cada código de erro?

O Baileys usa códigos HTTP para indicar razões de desconexão:

| Código | Nome | Descrição | Ação |
|--------|------|-----------|------|
| **401** | loggedOut | Usuário fez logout | Limpa sessão + gera novo QR |
| **403** | forbidden | Acesso negado | Reconecta |
| **408** | timedOut | Timeout de conexão | Reconecta em 5s |
| **411** | multideviceMismatch | Erro multi-device | Limpa sessão + gera novo QR |
| **428** | connectionClosed | Conexão fechada | Reconecta em 3s |
| **440** | connectionReplaced | Outra conexão assumiu | Não reconecta |
| **500** | badSession | Sessão inválida | Limpa sessão + gera novo QR |
| **503** | unavailableService | Serviço indisponível | Reconecta em 5s |
| **515** | restartRequired | **Restart necessário** | **Reconecta em 2s** |

## ✅ Como o código agora trata o erro 515?

```javascript
} else if (statusCode === DisconnectReason.restartRequired) {
  // 515 - WhatsApp pediu restart, reconectar imediatamente
  console.log(`🔄 RESTART NECESSÁRIO (515) - reconectando em 2s...`);
  this.clients.delete(tenantId);
  setTimeout(() => this.createClient(tenant), 2000);
```

### O que acontece:

1. **Detecta o erro 515** quando o WhatsApp pede restart
2. **Remove o cliente antigo** do mapa de clientes
3. **Aguarda 2 segundos** (para evitar loops muito rápidos)
4. **Cria um novo cliente** automaticamente
5. **Reconecta sem precisar escanear QR Code** (sessão permanece válida)

## 🎯 Diferença dos outros erros

### Erros que LIMPAM a sessão (precisam QR Code):
- ❌ **401 - loggedOut**: Usuário fez logout manual
- ❌ **500 - badSession**: Sessão corrompida/inválida
- ❌ **411 - multideviceMismatch**: Multi-device com problemas

### Erros que RECONECTAM (mantém sessão):
- ✅ **515 - restartRequired**: Restart solicitado ← **SEU CASO**
- ✅ **408 - timedOut**: Timeout normal
- ✅ **428 - connectionClosed**: Conexão caiu

## 📊 Log de reconexão normal

Quando o erro 515 acontece, você verá:

```
⚠️ MANIA DE MULHER desconectado - Código: 515

🔄 RESTART NECESSÁRIO (515) - reconectando em 2s...

📱 Criando cliente Baileys para tenant: MANIA DE MULHER

🔌 INICIALIZANDO MANIA DE MULHER
⏳ Carregando WhatsApp Web...

🚀 MANIA DE MULHER - CONECTADO E ONLINE!
📱 WhatsApp: 5511999999999
✅ MANIA DE MULHER pode enviar e receber mensagens!
```

**Repare:** Não aparece QR Code! A reconexão é automática.

## ⚠️ Quando o QR Code SERÁ necessário?

Apenas nestes casos:

1. **Primeiro login** (nunca conectou antes)
2. **Logout manual** (código 401)
3. **Sessão inválida** (código 500)
4. **Multi-device mismatch** (código 411)
5. **Conexão substituída** (código 440)

## 🔧 Teste manual

Para forçar uma reconexão e testar:

```bash
# Ver status atual
curl http://localhost:3333/status/08f2b1b9-3988-489e-8186-c60f0c0b0622

# Se o WhatsApp cair, ele reconecta sozinho em 2s
# Não precisa fazer nada!
```

## 🎉 Resultado

✅ **Erro 515 agora reconecta automaticamente**
✅ **Não precisa mais escanear QR Code**
✅ **Sessão permanece ativa**
✅ **Reconexão em 2 segundos**
✅ **Log claro mostrando o que aconteceu**

## 📝 Notas importantes

1. **Não é um erro grave** - É uma solicitação normal do WhatsApp
2. **Acontece periodicamente** - Especialmente após atualizações do WhatsApp
3. **Reconexão é automática** - Você não precisa fazer nada
4. **Sessão permanece válida** - Não precisa QR Code novamente
5. **2 segundos é suficiente** - Evita loops muito rápidos

## 🛠️ Troubleshooting

### Se o erro 515 aparecer múltiplas vezes seguidas:

1. **Verifique sua internet** - Conexão instável pode causar isso
2. **Aguarde alguns minutos** - O WhatsApp pode estar em manutenção
3. **Se persistir por mais de 10 minutos**: 
   ```bash
   # Limpar sessão e gerar novo QR
   .\limpar-sessao-baileys.bat
   .\start-baileys.bat
   ```

### Log suspeito de loop:

Se você ver isso:
```
🔄 RESTART NECESSÁRIO (515) - reconectando em 2s...
🔄 RESTART NECESSÁRIO (515) - reconectando em 2s...
🔄 RESTART NECESSÁRIO (515) - reconectando em 2s...
```

**Solução:** Limpe a sessão e gere novo QR Code (sessão pode estar corrompida).

## ✨ Conclusão

O erro **515 (restartRequired)** agora é tratado corretamente e **reconecta automaticamente** mantendo a sessão ativa. Não é mais um problema! 🎉
