

## Ajuste na lógica de DM e WhatsApp do Instagram Webhook

### Lógica atual (linha ~459)
- Sem cadastro + flag ativo → DM cadastro
- Com cadastro OU flag desativado → DM checkout
- WhatsApp só se tem telefone

### Nova lógica solicitada
1. **Sem cadastro** (@ não existe na tabela customers) + flag ativo → envia DM solicitando cadastro
2. **Com cadastro mas sem telefone** + flag ativo → envia DM solicitando cadastro
3. **Com cadastro e telefone preenchido** → **NÃO envia DM**, envia direto o WhatsApp de produto adicionado

### Mudança técnica

**Arquivo:** `supabase/functions/instagram-webhook/index.ts` (linhas 459-496)

Substituir a lógica condicional por:

```
const hasRegistration = !!customerData;
const hasPhone = !!customerData?.phone;

if (pageAccessToken) {
  if ((!hasRegistration || !hasPhone) && integration.send_cadastro_dm) {
    // Sem cadastro OU sem telefone → DM de cadastro
    → envia DM com link de cadastro
  } else if (!hasPhone) {
    // Flag desativado mas sem telefone → DM checkout padrão
    → envia DM com link de checkout
  }
  // Se tem cadastro COM telefone → não envia DM nenhuma
}

// WhatsApp direto se tem telefone
if (hasPhone && order) {
  → dispara WhatsApp de produto adicionado
}
```

A edge function será redeployada automaticamente.

