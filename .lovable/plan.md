## Automação de Retorno ao Grupo

Criar um sistema de reengajamento: quando um cliente sai de um grupo, o sistema envia um convite privado com promessa de cupom. Se o cliente voltar ao **mesmo grupo** dentro do prazo, recebe o código do cupom.

---

### 1. Rastreamento de estado por participante

Nova tabela `fe_group_membership_state` para saber, em O(1), se um telefone é **novo**, **ativo** ou **retornando** em cada grupo:

| coluna | uso |
|---|---|
| tenant_id, group_jid, phone | chave composta |
| status | `active` / `left` |
| first_joined_at | primeira vez que entrou |
| last_left_at | última saída |
| rejoin_count | quantas vezes voltou |
| pending_automation_id | automação de retorno pendente |
| pending_expires_at | prazo para receber o cupom |

Alimentada automaticamente pelo webhook (`uazapi-webhook` / `zapi-webhook`) sempre que houver `join` ou `leave`.

---

### 2. Nova aba **"Retorno"** no Fluxo de Envio

Cada tenant cria quantas automações quiser. Cada automação tem:

- **Nome** (ex.: "Volta VIP")
- **Grupos alvo** (multi-seleção — pode aplicar em vários grupos)
- **Delay do convite** após a saída (5 min / 1h / 24h / custom)
- **Mensagem de convite** (com `{nome}`, `{grupo}`, `{link_grupo}`)
- **Janela de validade** em dias (configurável — se voltar depois disso, não ganha cupom)
- **Cupom prometido** (código único compartilhado — dropdown de `coupons`)
- **Mensagem de recompensa** (entregue no privado quando voltar, com `{cupom}`)
- **Ativa / Pausada**

---

### 3. Fluxo de execução

```text
[cliente sai do grupo]
        ↓ webhook detecta leave
        ↓ atualiza fe_group_membership_state (status=left, rejoin_count++)
        ↓ busca automações ativas para esse grupo
        ↓ agenda sendflow_task após delay
        ↓ marca pending_automation_id + pending_expires_at

[após delay]
        ↓ edge function envia convite 1:1 (WhatsApp privado)

[cliente volta ao mesmo grupo]
        ↓ webhook detecta join
        ↓ se pending_automation_id existe E não expirou:
             → envia mensagem de recompensa com {cupom}
             → limpa pending
        ↓ senão: apenas atualiza status=active
```

Filtros importantes:
- Só aciona para telefones que **já tinham histórico** no grupo (não dispara para clientes novos — esses seguem o fluxo de boas-vindas existente).
- Uma pessoa não recebe convite duplicado se já tem um pendente.
- Se o cliente sair e voltar várias vezes, o cooldown evita spam (mín. 24h entre convites do mesmo grupo).

---

### 4. Alterações técnicas

**Backend / DB:**
- Migration: tabela `fe_group_membership_state` + tabela `fe_return_automations` + índices + GRANTs + RLS
- Migration: popular `fe_group_membership_state` a partir do histórico existente em `fe_group_events`

**Edge Functions:**
- `uazapi-webhook` e `zapi-webhook`: atualizar estado e enfileirar convites/recompensas
- Nova `fe-return-automation-dispatcher`: cron a cada 1 min que processa convites agendados
- Reaproveita `zapi-send-message` para o envio 1:1

**Frontend:**
- Nova aba **"Retorno"** dentro de `src/pages/fluxo-envio/Index.tsx`
- Novo componente `ReturnAutomationsManager.tsx` (CRUD + listagem de execuções recentes)

---

### Fora do escopo desta entrega
- Boas-vindas para clientes novos (já existe fluxo próprio).
- Cupom individual gerado na hora (você optou por código compartilhado).
- Relatório dedicado de conversão — nesta versão só logamos convite enviado / cupom entregue em `fe_messages`; se quiser dashboard depois, faço numa segunda fase.
