
# Plano: Exportar Produtos do Sistema para o Bling ERP

## Objetivo
Implementar a funcionalidade de enviar produtos cadastrados no sistema para o Bling ERP via API v3, seguindo o mesmo padrão já utilizado para sincronização de pedidos.

## Arquitetura da Solução

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (React)                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  BlingProductsSyncPanel.tsx                              │   │
│  │  - Botão "Exportar Produtos para Bling"                  │   │
│  │  - Contagem de produtos pendentes/sincronizados          │   │
│  │  - Feedback visual de progresso                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Supabase Edge Function                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  bling-sync-products/index.ts                            │   │
│  │  - Ações: send_product, sync_all, fetch_products         │   │
│  │  - Valida token OAuth (refresh automático)               │   │
│  │  - Envia POST /produtos para Bling API v3                │   │
│  │  - Atualiza bling_product_id na tabela products          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Bling API v3                                       │
│  - POST https://www.bling.com.br/Api/v3/produtos                │
│  - Campos: nome, codigo, tipo, situacao, formato, preco         │
└─────────────────────────────────────────────────────────────────┘
```

## Etapas de Implementação

### 1. Migração de Banco de Dados
Adicionar coluna `bling_product_id` na tabela `products` para rastrear produtos já exportados:

```sql
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS bling_product_id BIGINT DEFAULT NULL;

COMMENT ON COLUMN public.products.bling_product_id IS 'ID do produto no Bling ERP após sincronização';
```

### 2. Criar Edge Function `bling-sync-products`
Nova função em `supabase/functions/bling-sync-products/index.ts`:

**Funcionalidades:**
- `send_product`: Envia um produto específico para o Bling
- `sync_all`: Envia todos os produtos ativos que ainda não têm `bling_product_id`
- `fetch_products`: Busca produtos do Bling (para referência)

**Payload para Bling API v3:**
```json
{
  "nome": "Nome do Produto",
  "codigo": "SKU-001",
  "tipo": "P",
  "situacao": "A",
  "formato": "S",
  "preco": 99.90
}
```

**Mapeamento de campos:**
| Sistema Local | Bling API v3 |
|---------------|--------------|
| `name` | `nome` |
| `code` | `codigo` |
| `price` | `preco` |
| `is_active` | `situacao` (A/I) |
| - | `tipo` = "P" (Produto) |
| - | `formato` = "S" (Simples) |

### 3. Criar Componente `BlingProductsSyncPanel`
Novo componente em `src/components/integrations/BlingProductsSyncPanel.tsx`:

**Interface:**
- Exibe contagem de produtos pendentes de sincronização
- Exibe contagem de produtos já sincronizados
- Botão "Exportar para Bling" que envia produtos em lote
- Feedback visual com toast de sucesso/erro
- Tratamento de erros de escopo OAuth

### 4. Integrar Painel na Página de Integrações Bling
Atualizar `src/components/integrations/BlingIntegration.tsx`:

- Adicionar condição para exibir `BlingProductsSyncPanel` quando:
  - `sync_products` estiver habilitado
  - Integração estiver autorizada (OAuth válido)

### 5. Atualizar Tipos TypeScript
Atualizar `src/integrations/supabase/types.ts` não é necessário (gerado automaticamente pela API do Supabase).

---

## Detalhes Técnicos

### Edge Function: Estrutura Principal

```typescript
// Ações suportadas
switch (action) {
  case 'send_product':
    // Envia produto específico por ID
    break;
  case 'sync_all':
    // Busca produtos sem bling_product_id e envia em lote
    break;
  case 'fetch_products':
    // Busca produtos do Bling (GET /produtos)
    break;
}
```

### Tratamento de Erros
- Token expirado: refresh automático antes de enviar
- Produto duplicado: buscar ID existente no Bling pelo código
- Escopo insuficiente: retornar mensagem clara para o usuário

### Rate Limiting
- Bling limita a 3 requisições por segundo
- Usar delay de 350ms entre requisições (mesmo padrão dos pedidos)

---

## Arquivos a Serem Criados/Modificados

| Arquivo | Ação |
|---------|------|
| `supabase/functions/bling-sync-products/index.ts` | Criar |
| `src/components/integrations/BlingProductsSyncPanel.tsx` | Criar |
| `src/components/integrations/BlingIntegration.tsx` | Modificar |
| Migração SQL (via ferramenta) | Executar |

---

## Fluxo de Uso

1. Usuário acessa **Integrações > Bling ERP**
2. Ativa o toggle **"Produtos"** nos módulos de sincronização
3. Novo painel **"Sincronização de Produtos"** aparece
4. Usuário clica em **"Exportar para Bling"**
5. Sistema envia produtos ativos sem `bling_product_id`
6. Após sucesso, coluna `bling_product_id` é atualizada
7. Na próxima exportação, apenas produtos novos são enviados
