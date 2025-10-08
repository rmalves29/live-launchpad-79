# Servidor WhatsApp - SEM Limpeza Automática

## ✅ Mudanças Implementadas

### 1. **Removido: Limpeza Automática no Startup**
- ❌ Não apaga mais `lockfile`
- ❌ Não apaga mais `.wwebjs_cache`
- ❌ Não apaga nada dentro de `.wwebjs_auth`

### 2. **Removido: Limpeza no Handler `disconnected`**
- ❌ Não apaga mais `session-*`
- ❌ Não apaga mais `.wwebjs_cache`
- ❌ Nenhum `rmSync` ou `unlink` automático

### 3. **Comportamento em Desconexão**
Agora, em qualquer desconexão, o sistema apenas:
```javascript
await client.destroy();
await client.initialize();
```

**Resultado**: Se o WhatsApp invalidar a sessão (UNPAIRED/LOGOUT), o sistema simplesmente re-inicializa e exibe o QR Code, **sem deletar nada no disco**.

### 4. **Endpoint `/disconnect/:tenantId`**
Modificado para **NÃO limpar sessão**:
- Apenas faz `destroy()`
- Preserva sessão no disco
- Mensagem: "WhatsApp desconectado (sessão preservada)"

### 5. **Novo Endpoint: `/admin/wipe-session`** ✨
Endpoint **MANUAL** e **PROTEGIDO** para limpeza de sessão quando você quiser:

#### Como usar:
```bash
POST http://localhost:3333/admin/wipe-session
Header: X-Admin-Key: sua-chave-secreta-aqui
```

#### Configuração:
Defina a variável de ambiente `ADMIN_KEY` no seu arquivo `.env` ou ao iniciar o servidor:

```bash
# Windows
set ADMIN_KEY=minha-chave-super-secreta-123
node server-whatsapp-individual.js

# Linux/Mac
ADMIN_KEY=minha-chave-super-secreta-123 node server-whatsapp-individual.js
```

#### O que faz:
1. Valida a chave `X-Admin-Key` com `process.env.ADMIN_KEY`
2. Destrói o cliente (`client.destroy()`)
3. Remove `SESSION_DIR` e `CACHE_BASE`
4. **NÃO reinicia automaticamente** (você deve reiniciar manualmente)

#### Exemplo de uso:
```bash
curl -X POST http://localhost:3333/admin/wipe-session \
  -H "X-Admin-Key: minha-chave-super-secreta-123"
```

Resposta:
```json
{
  "success": true,
  "message": "Sessão limpa manualmente. Inicie o servidor novamente para reconectar.",
  "removed": [
    "C:\\ProgramData\\OrderZaps\\.wwebjs_auth\\session-08f2b1b9-...",
    "C:\\ProgramData\\OrderZaps\\.wwebjs_cache"
  ],
  "failed": [],
  "note": "Cliente não será reiniciado automaticamente"
}
```

## 🎯 Critérios de Aceitação

- ✅ Nenhuma chamada a `LocalAuth.logout()` no projeto
- ✅ Nenhuma limpeza de `.wwebjs_auth`, `lockfile` ou `.wwebjs_cache` no startup
- ✅ Nenhuma limpeza automática no handler `disconnected`
- ✅ Em desconexão: apenas `destroy()` → `initialize()` sem apagar nada
- ✅ Endpoint `/admin/wipe-session` protegido por header para limpeza manual

## 📝 Notas Importantes

### Quando usar `/admin/wipe-session`:
- Quando o WhatsApp ficar definitivamente desconectado e não conseguir reconectar
- Quando você quiser forçar um novo QR Code
- Em casos de sessão corrompida que não se recupera automaticamente

### Segurança:
- **NUNCA** compartilhe sua `ADMIN_KEY`
- Use uma chave forte e aleatória
- O endpoint retorna 403 se a chave estiver incorreta
- O endpoint retorna 500 se `ADMIN_KEY` não estiver configurada

### Fluxo Normal:
1. **Primeira vez**: Scanner QR Code → Conecta
2. **Reconexões**: Sistema reconecta automaticamente usando sessão salva
3. **Desconexão permanente**: Sistema mostra QR Code (sem apagar sessão)
4. **Limpeza forçada**: Use `/admin/wipe-session` quando necessário

## 🚀 Como Iniciar

```bash
# Defina a chave admin (recomendado)
set ADMIN_KEY=sua-chave-aqui

# Inicie o servidor
node server-whatsapp-individual.js
```

## 🔍 Logs

O sistema agora mostra logs mais simples em desconexão:
```
🔌 Desconectado: UNPAIRED
🔄 Destruindo cliente...
🔄 Reinicializando cliente...
📱 QR CODE GERADO! Acesse http://localhost:3333 no navegador
```

**SEM** mensagens de limpeza de sessão, a menos que você use o endpoint manual.
