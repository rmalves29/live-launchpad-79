# Refazer Regra de Consentimento (todos os tenants)

A lógica antiga tinha toggle por tenant (`consent_protection_enabled`), pedido criado mesmo sem consentimento, expiração de 30min na confirmação. Vamos **substituir tudo** por uma máquina de estados única, válida para todos os tenants, **mantendo os templates que cada loja já configurou**.

## Comportamento desejado

```text
                          [SEM_CONSENTIMENTO]
                                  │
                  item adicionado │ envia "Solicitação"
                                  ▼
                          [AGUARDANDO_RESPOSTA]
                          (janela de 1 hora)
                                  │
                ┌─────────────────┼─────────────────┐
       responde│ SIM              │ não responde   │ adiciona outro item
                ▼                  ▼ (após 1h)      ▼
        [CONSENTIMENTO_ATIVO]  [SILENCIADO_1H]  silencia (sem msg nova)
        (válido por 3 dias)         │
                │                   │ próximo item
                │ próximo item      │ adicionado após 1h
                │ dentro de 3 dias  ▼
                ▼            envia nova "Solicitação"
        envia mensagem com link   → volta para AGUARDANDO_RESPOSTA
        (template "com link")
                │
                │ após 3 dias
                ▼
        [SEM_CONSENTIMENTO] (volta ao início)
```

### Regras precisas

1. **1ª mensagem** (cliente novo ou expirado): envia **uma mensagem só** com info do produto + pergunta "quer continuar recebendo as mensagens? Responda SIM". Cria estado `awaiting` com `expires_at = now + 1h`.

2. **Itens adicionais enquanto está `awaiting`**: pedido é criado normalmente, **mensagem silenciada** (não reenvia pergunta).

3. **Cliente responde SIM**: marca `active`, válido por **3 dias**. Não envia nada de volta no momento do SIM (apenas atualiza DB). Próximas adições nesses 3 dias → mensagem **com link de checkout**.

4. **Não responde em 1h**: estado vira `silenced`. Itens adicionados nessa janela continuam silenciados. **Após 1h**, o próximo item dispara **nova solicitação** (volta ao passo 1).

5. **Após 3 dias** de consentimento ativo: expira. Próxima adição vira nova solicitação.

6. **Resposta NÃO** (negativa explícita): mesmo comportamento de "não respondeu" — silencia por 1h, depois pede de novo.

## Templates (NÃO mudam)

Continuamos lendo da própria tenant em `integration_whatsapp`:
- **Solicitação** → `template_solicitacao` (ou template padrão se vazio)
- **Com link** → `template_com_link` (ou template padrão se vazio)

Os textos padrão atuais permanecem como fallback. **Nenhuma tenant que já personalizou perderá seu template.**

## Mudanças técnicas

### 1. Banco de dados (migração)

Nova tabela única para o estado da máquina:

```sql
create table whatsapp_consent_state (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_phone text not null,                  -- normalizado (E.164 sem '+')
  status text not null,                          -- 'awaiting' | 'active' | 'silenced' | 'declined'
  request_sent_at timestamptz,
  request_expires_at timestamptz,                -- request_sent_at + 1h
  consent_granted_at timestamptz,
  consent_expires_at timestamptz,                -- consent_granted_at + 3 dias
  last_message_at timestamptz,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (tenant_id, customer_phone)
);
create index on whatsapp_consent_state (tenant_id, customer_phone);
```

Backfill inicial: copiar quem hoje tem `customers.consentimento_ativo=true` para `status='active'` com `consent_expires_at = data_permissao + 3 dias`.

### 2. Edge function `zapi-send-item-added`

Substituir o bloco de "lógica de consentimento" (linhas ~430–546) por uma máquina única que **ignora** `consent_protection_enabled` (passa a ser global) mas continua lendo `template_solicitacao` e `template_com_link` da própria tenant.

Pseudo-fluxo:
```text
state = SELECT * FROM whatsapp_consent_state WHERE tenant_id, customer_phone

if state == null
   OR (status='silenced'  AND request_expires_at < now)
   OR (status='active'    AND consent_expires_at < now)
   OR (status='declined'  AND request_expires_at < now)
   OR (status='awaiting'  AND request_expires_at < now):
       enviar SOLICITAÇÃO usando templateSolicitacao
       upsert: status='awaiting', request_sent_at=now, request_expires_at=now+1h

elif status == 'awaiting':         # ainda dentro de 1h
       silencia (pedido criado, msg não enviada)
       update last_message_at

elif status == 'silenced':         # ainda dentro de 1h
       silencia

elif status == 'active':           # dentro dos 3 dias
       enviar COM LINK usando templateComLink
       update last_message_at
```

### 3. Edge function `zapi-webhook` (resposta SIM/NÃO)

No bloco que processa "SIM" (linhas ~2200–2400):
- Em vez de marcar `customers.consentimento_ativo`, atualizar o estado:
  ```sql
  UPDATE whatsapp_consent_state
     SET status='active',
         consent_granted_at=now(),
         consent_expires_at=now()+interval '3 days'
   WHERE tenant_id=? AND customer_phone=?;
  ```
- **Não envia mensagem de volta** ao cliente quando ele responde SIM.
- Resposta "NÃO": `status='declined'`, `request_expires_at = now + 1h`.

### 4. Limpeza (não destrutiva)

- `pending_message_confirmations`: continua existindo para outros tipos. O tipo `item_added` deixa de ser criado por essa rota (a fonte de verdade vira `whatsapp_consent_state`).
- Manter colunas legadas (`consent_protection_enabled`, `customers.consentimento_ativo`, `customers.data_permissao`) por compatibilidade. Remover em PR posterior.

## Resultado prático

- Mesma regra para **todos os tenants**, sem precisar configurar nada.
- **Templates personalizados de cada loja são preservados.**
- Cliente novo recebe **uma única mensagem** (sem spam de repetição).
- Não responde em 1h → silêncio até próxima adição após 1h, aí pergunta de novo.
- Responde SIM → 3 dias recebendo com link direto.
- Após 3 dias, volta a pedir confirmação.

## Validação

Após deploy, testar com `31992904210` adicionando `C633` na Mania de Mulher:
1. 1ª adição → chega solicitação.
2. 2ª adição em <1h sem responder → não chega nada, pedido criado.
3. Esperar 1h (ou forçar via SQL), próxima adição → chega nova solicitação.
4. Responder SIM → próxima adição vem com link.
5. Forçar `consent_expires_at` para o passado → próxima adição volta a ser solicitação.
