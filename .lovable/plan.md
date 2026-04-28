

## Identificação progressiva no /t/app: IP/localStorage → @Instagram → Telefone

### Resposta direta

Sim. Vou transformar o modal único atual em um fluxo de 3 passos progressivos, sempre tentando o caminho menos invasivo primeiro:

```text
1. Cliente clica "Adicionar"
   ↓
2. Sistema tenta identificar por IP + localStorage  (silencioso)
   ├─ Encontrou → adiciona ao carrinho direto, sem modal ✅
   └─ Não encontrou ↓
3. Modal abre pedindo SÓ o @ do Instagram
   ├─ Cliente digita @ → backend busca em customers (tenant_id, instagram)
   │   ├─ Encontrou cliente → "Olá, @fulano! Vamos continuar." ✅
   │   │   adiciona ao carrinho direto, salva identidade
   │   └─ Não encontrou → modal expande pedindo o WhatsApp ↓
4. Cliente digita WhatsApp
   ├─ Telefone já existe em customers → reusa cadastro, atualiza @
   └─ Telefone novo → cria customer novo
```

### Camada 1 — Tentativa silenciosa (já existe, mantida)

`TenantStorefront.tsx` já consulta `localStorage.storefront_identity_<slug>` e a função `storefront-resolve-visitor` (que casa por hash de IP). Sem mudanças aqui.

### Camada 2 — Lookup por @Instagram (novo)

Nova edge function `storefront-lookup-by-instagram`:

- Recebe `{ tenant_slug, instagram }`
- Normaliza o @ (remove `@`, espaços, lowercase opcional dependendo do dado salvo)
- Busca `customers` por `(tenant_id, instagram)` usando `ilike` para ser case-insensitive
- Se `is_blocked = true` → retorna `{ blocked: true }` (modal mostra mensagem de contato com a loja)
- Se encontrou → retorna `{ found: true, phone, instagram, name }`
- Se não encontrou → retorna `{ found: false }`

A função **não cria nada** — é só lookup. A criação continua no `storefront-add-to-cart` que já recebe `customer_phone`.

### Camada 3 — Modal progressivo (substitui o atual)

Refatorar `IdentifyCustomerDialog.tsx` para ter 2 estados internos:

**Estado A — "Identifique-se"** (estado inicial)
- Único campo: `@ do Instagram`
- Botão: "Continuar"
- Texto auxiliar: "Use o mesmo @ que você usa nas nossas lives"
- Ao clicar → chama `storefront-lookup-by-instagram`
  - `found: true` → fecha modal, salva identidade no localStorage, dispara `onConfirm({ instagram, phone })`
  - `found: false` → transição suave para Estado B (mantém o @ digitado)
  - `blocked: true` → mostra erro vermelho "Cliente bloqueado. Entre em contato com a loja."

**Estado B — "Primeira compra? Bem-vindo!"** (após @ não encontrado)
- Mostra o @ digitado em destaque (chip ou linha "Cadastrando @fulano")
- Campo único: `WhatsApp` (com máscara BR existente)
- Link discreto "← usar outro @" volta ao Estado A
- Botão: "Confirmar e adicionar"
- Ao clicar → dispara `onConfirm({ instagram, phone })` que vai para `storefront-add-to-cart` (cria cliente novo)

### Garantias e edge cases

- **Telefone já cadastrado com outro @**: o `storefront-add-to-cart` continua respeitando a regra atual — busca por `(tenant_id, phone)`, e se já existir customer com Instagram preenchido, **não sobrescreve** (preserva o histórico). Se o Instagram estiver vazio, atualiza com o novo @.
- **Cliente bloqueado**: tanto no lookup por @ quanto no add-to-cart final, retorna 403 / `blocked: true` e o modal mostra a mensagem "Cliente bloqueado. Entre em contato com a loja."
- **Identidade persistente**: após qualquer sucesso (Estado A ou B), salva `localStorage.storefront_identity_<slug> = { phone, instagram }` e o backend já atualiza `storefront_visitors` com o IP hash. Próximas adições não pedem nada.
- **Múltiplos clientes com mesmo @**: improvável, mas se acontecer pega o mais recente (`order by id desc limit 1`).
- **@ vazio ou inválido no Estado A**: validação já existente (sanitiza, exige pelo menos 1 caractere).

### O que NÃO muda

- `storefront-add-to-cart/index.ts` — continua igual, ainda recebe `{ tenant_slug, product_id, qty, customer_phone, customer_instagram }`.
- `storefront-resolve-visitor/index.ts` — Camada 1 silenciosa permanece intacta.
- Fluxo de checkout, pagamento, estoque, total — nenhuma mudança.
- Tabelas, RLS, triggers — sem migrações.

### Detalhes técnicos

**Arquivos editados:**

- `src/components/storefront/IdentifyCustomerDialog.tsx`
  - Adicionar estado interno `step: 'instagram' | 'phone'`
  - Estado A renderiza só o input de @ + botão "Continuar"
  - Estado B renderiza chip do @ + input de telefone + link "usar outro @" + botão "Confirmar e adicionar"
  - No "Continuar" do Estado A, chama a nova função e decide o próximo passo
  - Manter prop `onConfirm({ instagram, phone })` igual para não quebrar `TenantStorefront.tsx`
  - Loading states distintos para lookup (Estado A) e add-to-cart (Estado B)
  - Mensagem de "Bem-vindo de volta, @fulano!" via toast quando lookup encontra cliente

- `supabase/functions/storefront-lookup-by-instagram/index.ts` (novo)
  - Body: `{ tenant_slug: string, instagram: string }`
  - Resolve tenant ativo, normaliza @, busca em `customers`
  - Retorna `{ found, phone?, instagram?, name?, blocked? }`
  - CORS padrão, sem autenticação (público), service role internamente
  - Logs estruturados para debug

- `supabase/config.toml`
  - Adicionar `[functions.storefront-lookup-by-instagram] verify_jwt = false`

- `src/pages/TenantStorefront.tsx`
  - Quando o `IdentifyCustomerDialog` confirmar via Estado A (cliente encontrado por @), persistir no `localStorage.storefront_identity_<slug>` igual ao fluxo atual — nenhuma mudança de lógica externa, só passa a receber `{ phone, instagram }` resolvido pelo dialog.

**Sem migrações de banco. Sem novos secrets.**

### Validação após deploy

1. **Cliente conhecido por IP**: abrir vitrine de um tenant onde já comprou antes → clicar "Adicionar" → produto cai no carrinho sem modal.
2. **Cliente novo, mas registrado**: limpar localStorage + abrir em rede diferente (4G no celular) → clicar "Adicionar" → modal pede @ → digitar @ existente → toast "Bem-vindo de volta, @fulano!" e produto adicionado sem pedir telefone.
3. **Cliente totalmente novo**: digitar @ que não existe → modal expande para pedir WhatsApp → confirmar → produto adicionado, customer criado.
4. **Cliente bloqueado**: digitar @ de cliente com `is_blocked = true` → mensagem "Cliente bloqueado. Entre em contato com a loja." (mesmo no Estado A, antes de chegar no add-to-cart).
5. **Voltar e trocar @**: no Estado B, clicar "← usar outro @" → volta ao Estado A com input limpo.

