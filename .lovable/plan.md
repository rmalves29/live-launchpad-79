

## Plano: Módulo de Emissão de Etiquetas via API CWS dos Correios

### Visão Geral

Adicionar uma aba "Etiquetas" dentro da integração Correios (contrato próprio) que permite gerar pré-postagens, obter códigos de rastreio e imprimir etiquetas no padrão 10x15cm usando a **API CWS oficial dos Correios** (`api.correios.com.br/prepostagem`).

### Arquitetura

```text
┌─────────────────────────────────────────────────┐
│  CorreiosIntegration.tsx (aba existente)         │
│  ┌─────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Config  │ │ Serviços │ │ Etiquetas (NOVA) │  │
│  └─────────┘ └──────────┘ └──────────────────┘  │
│                                │                 │
│         CorreiosCWSLabels.tsx  │                 │
│         (lista pedidos, gera, │                 │
│          imprime, histórico)  │                 │
└───────────────────────────────┼─────────────────┘
                                │
                    Edge Function: correios-labels
                    ├─ POST /prepostagem (criar + rastreio)
                    ├─ GET  /prepostagem/{id}/etiqueta (PDF)
                    └─ Atualiza order.melhor_envio_tracking_code
```

### Implementação

#### 1. Nova Edge Function `correios-labels/index.ts`

Actions suportadas:
- **`create_prepostagem`**: Recebe `tenant_id` + `order_ids[]` + `service_overrides{}`. Para cada pedido:
  - Autentica com cartão de postagem (reutiliza lógica de `correios-shipping`)
  - Busca dados do pedido + endereço remetente (tenant)
  - Chama `POST api.correios.com.br/prepostagem` com payload CWS (remetente, destinatário, objeto postal com peso/dimensões, serviço)
  - Extrai `idPrePostagem` e `codigoObjeto` (rastreio)
  - Chama `GET /prepostagem/{id}/etiqueta` para obter PDF base64
  - Salva `melhor_envio_tracking_code` no pedido
  - Envia WhatsApp com rastreio (se Z-API ativa)
  - Retorna resultado por pedido (rastreio, PDF base64, status)

- **`list_plps`**: Lista pré-postagens já criadas para histórico

Credenciais reutilizadas da integração `correios` existente em `shipping_integrations`:
- `client_id` / `client_secret` → autenticação CWS
- `refresh_token` → cartão de postagem
- `scope` → número do contrato
- `from_cep` → CEP remetente
- Campos adicionais para remetente (nome, endereço) serão buscados da tabela `tenants`

#### 2. Novo Componente `CorreiosCWSLabels.tsx`

Três seções:

**a) Configuração do Remetente** — Dados complementares para a etiqueta (nome empresa, endereço completo, telefone). Salvos na integração (`webhook_secret` como JSON).

**b) Listagem de Pedidos** — Tabela com pedidos pagos sem rastreio, filtro por data. Colunas: checkbox, ID, destinatário, cidade/UF, serviço (PAC/SEDEX com selector), peso. Botões: "Gerar Etiquetas Selecionadas".

**c) Resultado / Histórico** — Após geração: lista com rastreio, download individual de PDF, download em lote. Histórico de PLPs anteriores com opção de reimprimir.

**d) Visualização de Etiqueta** — Componente de impressão 10x15cm (A6) com:
- Logo Correios + serviço
- Endereço destinatário/remetente formatados
- Código de barras Code128 (rastreio) — usando biblioteca `react-barcode` ou canvas
- CEP destino em formato grande
- Botão "Imprimir PDF" que abre diálogo do navegador com `@media print` configurado para A6

#### 3. Alterações em Arquivos Existentes

- **`CorreiosIntegration.tsx`**: Adicionar Tabs internas (Configuração | Etiquetas). Quando integração ativa, mostrar aba Etiquetas com `CorreiosCWSLabels`.
- **`supabase/config.toml`**: Adicionar `[functions.correios-labels]` com `verify_jwt = false`.

#### 4. Tabela de Histórico (opcional/futura)

Inicialmente, o histórico será exibido buscando pedidos que já possuem rastreio no período. Se necessário futuramente, criar tabela `correios_plps` para persistir lotes/PLP fechadas.

### Arquivos

| Arquivo | Ação |
|---|---|
| `supabase/functions/correios-labels/index.ts` | Criar |
| `src/components/integrations/CorreiosCWSLabels.tsx` | Criar |
| `src/components/integrations/CorreiosLabelPrint.tsx` | Criar (componente de impressão A6) |
| `src/components/integrations/CorreiosIntegration.tsx` | Editar (adicionar tabs internas) |
| `supabase/config.toml` | Editar (adicionar função) |

### Limitações Conhecidas

- A API CWS de pré-postagem (código 36) precisa estar habilitada no contrato do cliente no portal CWS
- O layout da etiqueta será gerado no frontend via HTML/CSS para impressão, mas o PDF oficial também é baixado da API como alternativa
- Código de barras Code128 será gerado via canvas/SVG no componente de visualização
- Dimensões padrão do `app_settings` serão usadas quando o pedido não tiver peso/dimensões específicos

