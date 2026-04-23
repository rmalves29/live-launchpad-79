

## Forçar atualização do cadastro no Bling com retry automático em caso de erro

### Resposta direta

Quando a atualização automática do cadastro do cliente no Bling falhar (timeout, erro 4xx/5xx, contato bloqueado, etc.), o sistema vai **automaticamente tentar de novo em modo "forçado"** — sem precisar de clique manual.

### Como vai funcionar

**Fluxo novo na criação do pedido no Bling** (`bling-sync-orders`):

```text
1. Resolver contato no Bling (busca ou cria)
2. Tentar atualizar cadastro (PUT /contatos/{id})
   ├─ Sucesso → segue para criar pedido
   └─ Erro    → aguarda 1s e RETRY em modo forçado
                ├─ Sucesso → segue para criar pedido
                └─ Erro    → segue para criar pedido + log de aviso
3. Criar pedido no Bling SEMPRE com transporte.contato.endereco completo
   (garante endereço certo no pedido mesmo se contato continuar errado)
```

**Modo "forçado" (retry):**
- Ignora qualquer cache/short-circuit interno
- Reenvia o payload completo do cadastro (nome, endereço, telefone, CPF)
- Usa timeout maior (15s em vez de 8s)
- Registra tentativa em `bling_sync_logs` com flag `forced: true`

### Aplicação em todas as 3 superfícies

| Onde | Comportamento |
|---|---|
| **Pedido novo (auto-sync)** | Tenta normal → se falhar, retry forçado automático |
| **Botão "Atualizar Endereço no Bling"** (no `ViewOrderDialog`) | Já força sempre (passa `force: true`) |
| **"Atualizar Cadastro de Clientes no Bling"** (em massa) | Já força sempre (passa `force: true`) |

### Garantia adicional: endereço no pedido independente do contato

Mesmo se as 2 tentativas de atualizar o contato falharem, o **pedido criado no Bling** vai sair com o endereço correto, porque o payload do pedido passa a incluir explicitamente:

```text
transporte.contato: {
  nome, endereco, numero, complemento,
  bairro, cep, municipio, uf
}
```

Isso resolve definitivamente o problema dos pedidos 5905 e 5922 (contato desatualizado → pedido sai com endereço errado).

### O que NÃO muda

- Frontend (botões já existentes continuam idênticos)
- Tabelas, RLS, triggers
- Lógica de criação do contato (busca CPF → telefone → nome)
- Demais integrações (Olist, Omie, Bagy)

### Detalhes técnicos

**Arquivos editados:**

- `supabase/functions/bling-sync-orders/index.ts`
  - Função `updateBlingContactAddress`: aceitar parâmetro `force: boolean`; em modo forçado, pular qualquer short-circuit e usar timeout 15s
  - Bloco de criação de pedido: envolver chamada de update em try/catch com 1 retry automático em modo forçado após 1s
  - Payload de criação do pedido: adicionar `transporte.contato` completo com endereço do nosso banco

- `supabase/functions/sync-address-bling/index.ts`
  - Aceitar `force: boolean` no body (default `true`)
  - Quando `true`, pular short-circuits e sempre executar PUT no contato + PUT no transporte

- `src/components/integrations/BlingBulkAddressSync.tsx`
  - Enviar `force: true` em todas as 3 ações (single, bulk, retry)

**Logs estruturados** em `bling_sync_logs` com:
- `attempt: 1` (normal) ou `attempt: 2` (forçado)
- `error_reason` em caso de falha
- `forced: boolean`

**Sem migrações de banco. Sem novos secrets.**

### Validação após deploy

1. Criar pedido teste para cliente cujo cadastro Bling esteja bloqueado/desatualizado → confirmar nos logs da função `bling-sync-orders` as 2 tentativas (normal + forçado), e o pedido aparecer no Bling com endereço correto via `transporte.contato`.
2. Rodar correção retroativa para pedidos **5905** e **5922** via botão "Atualizar Cadastro" (massa) com filtro de data cobrindo eles → confirmar contatos atualizados no Bling.
3. Conferir entradas em `bling_sync_logs` mostrando `attempt: 2, forced: true` quando aplicável.

