# 🚀 Deploy Edge Function WhatsApp Proxy v5.0

## ✅ Alterações Realizadas

A Edge Function foi atualizada para usar as rotas v5.0 do backend:

### Rotas v5.0 (Compatíveis com Railway)
- `POST /start/:id` - Inicia sessão e retorna QR code
- `GET /status/:id` - Verifica status da conexão
- `POST /disconnect/:id` - Desconecta sessão
- `POST /reset/:id` - Reseta sessão

## 📋 Pré-requisitos

1. **Supabase CLI instalado:**
   ```bash
   npm install -g supabase
   ```

2. **Login no Supabase:**
   ```bash
   npx supabase login
   ```

3. **Link com o projeto:**
   ```bash
   npx supabase link --project-ref hxtbsieodbtzgcvvkeqx
   ```

## 🚀 Deploy da Edge Function

### Opção 1: Deploy via CLI (Recomendado)

```bash
# No diretório raiz do projeto
npx supabase functions deploy whatsapp-proxy
```

### Opção 2: Deploy via Painel Supabase

1. Acesse: https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx
2. Navegue para **Edge Functions**
3. Selecione **whatsapp-proxy**
4. Clique em **Deploy New Version**
5. O código será automaticamente sincronizado do GitHub

### Opção 3: Deploy Manual

```bash
# Upload do código
npx supabase functions deploy whatsapp-proxy \
  --project-ref hxtbsieodbtzgcvvkeqx
```

## 🔍 Verificar Deploy

Após o deploy, teste a função:

```bash
# Verificar logs
npx supabase functions logs whatsapp-proxy --project-ref hxtbsieodbtzgcvvkeqx

# Testar endpoint (substitua {tenant_id} pelo ID real)
curl -X POST https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/whatsapp-proxy \
  -H "Content-Type: application/json" \
  -d '{"action":"status","tenant_id":"08f2b1b9-3988-489e-8186-c60f0c0b0622"}'
```

## 📝 Estrutura de Requisições

### Conectar WhatsApp (Obter QR Code)
```json
POST /functions/v1/whatsapp-proxy
{
  "action": "qr",
  "tenant_id": "08f2b1b9-3988-489e-8186-c60f0c0b0622"
}
```

### Verificar Status
```json
POST /functions/v1/whatsapp-proxy
{
  "action": "status",
  "tenant_id": "08f2b1b9-3988-489e-8186-c60f0c0b0622"
}
```

### Desconectar
```json
POST /functions/v1/whatsapp-proxy
{
  "action": "disconnect",
  "tenant_id": "08f2b1b9-3988-489e-8186-c60f0c0b0622"
}
```

### Resetar Sessão
```json
POST /functions/v1/whatsapp-proxy
{
  "action": "reset",
  "tenant_id": "08f2b1b9-3988-489e-8186-c60f0c0b0622"
}
```

## 🔧 Backend Configuration

A URL do backend deve estar configurada na tabela `integration_whatsapp`:

```sql
SELECT api_url, is_active 
FROM integration_whatsapp 
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';
```

**URL esperada:** `https://backend-production-2599.up.railway.app`

## ⚠️ Troubleshooting

### Erro 404: Rota não encontrada
- **Causa:** Backend não atualizado ou URL incorreta
- **Solução:** 
  1. Verificar se backend foi redesenhado no Railway
  2. Confirmar URL na tabela `integration_whatsapp`
  3. Testar diretamente: `curl https://backend-production-2599.up.railway.app/status/{tenant_id}`

### Erro 503: Não foi possível conectar
- **Causa:** Backend offline ou URL inacessível
- **Solução:** Verificar status do Railway

### Erro 502: Resposta HTML em vez de JSON
- **Causa:** URL aponta para página web em vez da API
- **Solução:** Corrigir URL para apontar para a API

## 📚 Arquivos Relacionados

- `supabase/functions/whatsapp-proxy/index.ts` - Código da Edge Function
- `supabase/config.toml` - Configuração do projeto
- `backend/src/routes/whatsapp.routes.js` - Rotas do backend v5.0
- `backend/src/controllers/whatsapp.controller.js` - Controllers atualizados

## ✅ Checklist de Deploy

- [ ] Backend atualizado no Railway
- [ ] Edge Function deployada no Supabase
- [ ] URL configurada na tabela `integration_whatsapp`
- [ ] Teste de status funcionando
- [ ] Teste de QR code funcionando
- [ ] Logs sem erros

## 🎉 Conclusão

Após seguir estes passos, o sistema estará 100% compatível com v5.0 e o QR code do WhatsApp deve ser gerado corretamente!
