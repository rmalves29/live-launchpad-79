# 📋 EXPLICAÇÃO COMPLETA DO SISTEMA ORDERZAP

## 1. O QUE É O ORDERZAP

OrderZap é um sistema SaaS **multi-tenant** para gestão de vendas via WhatsApp, lives e e-commerce. Cada "tenant" (empresa/loja) possui seus próprios dados isolados (pedidos, produtos, clientes, mensagens). O sistema é usado principalmente por vendedoras de bazares, cosméticos e moda que vendem ao vivo no Instagram/WhatsApp e precisam gerenciar pedidos, enviar confirmações automáticas e gerar etiquetas de frete.

---

## 2. STACK TECNOLÓGICA

| Camada | Tecnologia |
|--------|------------|
| **Frontend** | React 18 + TypeScript + Vite |
| **Estilização** | Tailwind CSS + shadcn/ui |
| **Roteamento** | React Router DOM v6 |
| **Estado/Cache** | TanStack React Query v5 |
| **Backend (BaaS)** | Supabase (PostgreSQL + Auth + Edge Functions + Storage) |
| **IA** | Lovable AI Gateway (Gemini 3 Flash) |
| **Integrações** | Z-API (WhatsApp), Bling ERP, Mercado Pago, Pagar.me, Melhor Envio, Correios, Mandae, Instagram |

**Observação importante**: NÃO existe um servidor backend Node.js/Express em produção. O frontend se comunica diretamente com o Supabase. As Edge Functions (Deno) fazem o papel de "backend" para lógica que precisa de chaves privadas ou processamento server-side.

---

## 3. ARQUITETURA MULTI-TENANT

### 3.1 Como funciona o isolamento

Toda tabela que contém dados de uma empresa possui a coluna `tenant_id` (UUID). O sistema usa um **wrapper** chamado `supabaseTenant` (`src/lib/supabase-tenant.ts`) que injeta automaticamente filtros de `tenant_id` em todas as queries (select, insert, update, delete).

### 3.2 Papéis de usuário (roles)

| Role | Permissões |
|------|-----------|
| `super_admin` | Acesso total. Pode trocar entre tenants via TenantSwitcher. Gerencia empresas em `/empresas`. |
| `tenant_admin` | Administrador de uma empresa específica. Acesso a todas as funcionalidades do seu tenant. |
| `staff` | Funcionário de uma empresa. Acesso limitado ao tenant vinculado. |

### 3.3 Contexto de Tenant

O `TenantContext` (`src/contexts/TenantContext.tsx`) é responsável por:
1. Identificar o tenant do usuário logado via `profiles.tenant_id`
2. Para `super_admin`: permite trocar de tenant via `localStorage('previewTenantId')`
3. Configurar o `supabaseTenant` com o `tenant_id` correto
4. Expor `tenant`, `tenantId`, `tenantSlug`, `isMainSite` para toda a aplicação

---

## 4. AUTENTICAÇÃO

- Usa **Supabase Auth** (email/senha)
- Ao criar conta, um trigger `handle_new_user()` cria automaticamente um registro na tabela `profiles`
- Componentes de proteção de rota:
  - `<RequireAuth>`: Exige login (qualquer role)
  - `<RequireTenantAuth>`: Exige login + tenant válido
- Existe também um sistema de **autenticação de tenant** (`TenantAuth`) para quando o sistema opera em subdomínios

---

## 5. BANCO DE DADOS (Supabase/PostgreSQL)

### 5.1 Tabelas principais

| Tabela | Descrição |
|--------|-----------|
| `tenants` | Cadastro de empresas (nome, slug, plano, limites, configurações) |
| `profiles` | Perfis de usuários (email, role, tenant_id) |
| `products` | Produtos de cada tenant (nome, código, preço, estoque, imagem, cor, tamanho) |
| `customers` | Clientes cadastrados (nome, telefone, endereço, CPF, consentimento LGPD) |
| `orders` | Pedidos (cliente, valor, status pagamento, data evento, endereço, rastreio) |
| `carts` | Carrinhos ativos (para modo Live) |
| `cart_items` | Itens dos carrinhos |
| `whatsapp_messages` | Histórico de mensagens WhatsApp enviadas |
| `integration_whatsapp` | Configuração Z-API por tenant (tokens, templates de mensagem) |
| `integration_bling` | Configuração Bling ERP por tenant (OAuth tokens, módulos ativos) |
| `integration_mp` | Configuração Mercado Pago por tenant |
| `integration_pagarme` | Configuração Pagar.me por tenant |
| `coupons` | Cupons de desconto (%, R$, progressivo) |
| `gifts` | Brindes por valor mínimo de compra |
| `custom_shipping_options` | Opções de frete customizadas por tenant |
| `sending_jobs` | Jobs de envio em massa (WhatsApp) |
| `sendflow_tasks` | Fila de tarefas do SendFlow (divulgação em grupos) |
| `sendflow_history` | Histórico de produtos já enviados para grupos |
| `scheduled_messages` | Mensagens agendadas para envio |
| `knowledge_base` | Base de conhecimento para IA de suporte |
| `mkt_mm` | Tabela de marketing para mensagens em massa |
| `audit_logs` | Logs de auditoria |
| `app_settings` | Configurações globais do sistema |

### 5.2 RLS (Row Level Security)

Todas as tabelas usam RLS policies para garantir que cada tenant só acesse seus próprios dados. Funções auxiliares:
- `get_current_tenant_id()` → retorna o tenant_id do usuário logado
- `is_super_admin()` → verifica se é super admin
- `is_tenant_admin()` → verifica se é admin do tenant
- `tenant_has_access(uuid)` → verifica se o tenant tem acesso ativo (plano/assinatura)

### 5.3 Triggers importantes

- `handle_new_user()` → cria profile ao registrar usuário
- `process_paid_order()` → ao marcar pedido como pago, envia WhatsApp automático
- `send_whatsapp_on_item_added()` → ao adicionar item no carrinho (Live), notifica via WhatsApp
- `close_cart_on_paid_order()` → fecha carrinho quando pedido é pago
- `close_cart_on_cancelled_order()` → fecha carrinho quando pedido é cancelado
- `set_unique_order_id()` → gera ID único para pedidos
- `create_default_whatsapp_templates()` → cria templates padrão ao criar tenant

---

## 6. PÁGINAS E FUNCIONALIDADES

### 6.1 Dashboard (`/` - Index)
Visão geral com métricas: pedidos do dia, faturamento, pedidos pendentes, etc.

### 6.2 Pedido Manual (`/pedidos-manual`)
Criação de pedidos manuais: selecionar cliente, adicionar produtos, aplicar cupons/brindes, definir frete.

### 6.3 Live (`/live`)
**Modo de venda ao vivo**: Simula uma live do Instagram/WhatsApp. O vendedor adiciona itens ao carrinho dos clientes em tempo real conforme eles pedem nos comentários. Cada cliente é identificado pelo telefone. Os carrinhos ficam abertos até serem finalizados.

### 6.4 Checkout (`/checkout`)
Página de finalização do pedido com seleção de frete (Correios, Melhor Envio, personalizado), endereço e pagamento.

### 6.5 Checkout Público (`/t/:slug/checkout`)
Checkout acessível por link público. Clientes acessam diretamente via link compartilhado pelo vendedor.

### 6.6 Pedidos (`/pedidos`)
Lista completa de pedidos com filtros (data, status pagamento, nome). Permite editar, visualizar detalhes, marcar como pago, cancelar, imprimir comprovante térmico.

### 6.7 Produtos (`/produtos`)
CRUD de produtos: nome, código, preço, estoque, cor, tamanho, imagem. Upload de imagem para Supabase Storage.

### 6.8 Clientes (`/clientes`)
Lista de clientes com endereço, telefone, consentimento LGPD. Sincronização com Bling (contatos).

### 6.9 SendFlow (`/sendflow`)
**Divulgação automática em grupos WhatsApp**: Seleciona produtos e grupos, o sistema envia imagens dos produtos nos grupos com delays inteligentes para evitar bloqueio do WhatsApp. Usa arquitetura de fila de tarefas (`sendflow_tasks`).

### 6.10 Agente IA (`/agente-ia`)
Chat com IA (Gemini) que tem acesso a TODOS os dados do tenant (pedidos, clientes, produtos, mensagens). Pode:
- Analisar vendas e faturamento
- Identificar top clientes (por volume e valor)
- Detectar estoque baixo
- Criar mensagens para WhatsApp
- Analisar imagens enviadas

### 6.11 Suporte IA (`/suporte-ia`)
Gerenciamento da base de conhecimento para o chatbot de suporte. Upload de documentos, categorização, ativação/desativação de artigos.

### 6.12 Relatórios (`/relatorios`)
Relatórios de vendas com gráficos (recharts): faturamento por período, produtos mais vendidos, etc.

### 6.13 Sorteio (`/sorteio`)
Funcionalidade de sorteio entre clientes.

### 6.14 Etiquetas (`/etiquetas`)
Geração de etiquetas de envio (Correios, Melhor Envio, Mandae).

### 6.15 Integrações (`/integracoes`)
Página com abas para configurar todas as integrações:

| Aba | Integração | Descrição |
|-----|-----------|-----------|
| Instagram | Instagram Live | Captura de pedidos via comentários |
| Bling | Bling ERP | Sincronização de pedidos e produtos |
| Mercado Pago | Pagamento | Links de pagamento, PIX |
| Pagar.me | Pagamento | Alternativa ao MP |
| Appmax | Pagamento | Outra opção de pagamento |
| Melhor Envio | Frete | Cotação e etiquetas |
| Correios | Frete | Cotação direta via contrato |
| Meus Correios | Frete | Geração de etiquetas em massa via meuscorreios.app |
| Mandae | Frete | Logística reversa e envios |

### 6.16 WhatsApp
- **Z-API** (`/whatsapp/zapi`): Configuração da conexão WhatsApp via Z-API (instance ID, token, client token)
- **Templates** (`/whatsapp/templates`): Personalização dos templates de mensagem (item adicionado, pedido pago, cobrança, SendFlow, mensagem em massa)
- **Cobrança** (`/whatsapp/cobranca`): Envio de cobranças em massa para pedidos pendentes

### 6.17 Configurações (`/config`)
- Dados da empresa (nome, logo, endereço)
- Horários de disponibilidade
- Configurações de impressora térmica
- Grupos WhatsApp permitidos

### 6.18 Empresas (`/empresas`) - Apenas super_admin
Gerenciamento de tenants: criar, editar, ativar/desativar empresas. Visualizar dados de cada tenant.

### 6.19 Landing Page (`/landing`)
Página institucional pública do OrderZap.

### 6.20 Renovar Assinatura (`/renovar-assinatura`)
Página para renovação de plano/assinatura via Mercado Pago.

### 6.21 Loja Pública (`/t/:slug`)
Storefront público de cada tenant acessível por slug.

---

## 7. EDGE FUNCTIONS (Backend Serverless)

Todas em `supabase/functions/`. Principais:

| Função | Descrição |
|--------|-----------|
| `ai-agent` | Chat com IA - busca dados do tenant e envia para Gemini via streaming |
| `support-chat` | Chat de suporte com base de conhecimento |
| `zapi-send-message` | Envio genérico de mensagem WhatsApp via Z-API |
| `zapi-send-paid-order` | Notificação de pagamento confirmado |
| `zapi-send-item-added` | Notificação de item adicionado ao carrinho |
| `zapi-send-tracking` | Envio de código de rastreio |
| `zapi-send-confirmation-link` | Envio de link de confirmação |
| `zapi-send-product-canceled` | Notificação de produto cancelado |
| `zapi-broadcast` | Envio em massa (mensagens em massa) |
| `zapi-proxy` | Proxy para chamadas Z-API |
| `zapi-webhook` | Webhook para receber mensagens do WhatsApp |
| `sendflow-process` | Processamento da fila de envio do SendFlow |
| `bling-oauth` / `bling-oauth-callback` | Fluxo OAuth do Bling |
| `bling-sync-orders` | Sincronização de pedidos com Bling |
| `bling-sync-products` | Exportação de produtos para Bling |
| `bling-refresh-tokens` | Renovação automática de tokens Bling |
| `bling-webhook` | Recebimento de webhooks do Bling |
| `correios-shipping` | Cotação de frete via Correios |
| `melhor-envio-shipping` | Cotação de frete via Melhor Envio |
| `melhor-envio-labels` | Geração de etiquetas Melhor Envio |
| `mandae-shipping` | Cotação via Mandae |
| `mandae-labels` | Geração de etiquetas Mandae |
| `create-payment` | Criação de link de pagamento (MP) |
| `create-subscription-payment` | Pagamento de assinatura |
| `mp-webhook` | Webhook do Mercado Pago |
| `pagarme-webhook` | Webhook do Pagar.me |
| `process-meus-correios` | Processamento de etiquetas via MeusCorreios |
| `instagram-webhook` | Webhook do Instagram para captura de comentários |
| `create-tenant-admin` | Criação de admin para novo tenant |
| `seed-knowledge-base` | Seed da base de conhecimento |

---

## 8. INTEGRAÇÕES EXTERNAS

### 8.1 Z-API (WhatsApp)
- **Propósito**: Enviar e receber mensagens WhatsApp sem precisar do WhatsApp Web aberto
- **Como funciona**: Cada tenant configura seu `instance_id`, `token` e `client_token` da Z-API. O sistema envia mensagens via HTTP REST para a API da Z-API
- **Mensagens automáticas**: Item adicionado, pedido pago, rastreio, cobrança
- **SendFlow**: Envia imagens de produtos em grupos WhatsApp com delays anti-bloqueio

### 8.2 Bling ERP
- **Propósito**: Sincronizar pedidos e produtos com o ERP
- **Autenticação**: OAuth 2.0 com refresh automático de tokens
- **Funcionalidades**: Exportar pedidos, exportar produtos, configurar dados fiscais (NCM, CFOP, ICMS)

### 8.3 Mercado Pago
- **Propósito**: Gerar links de pagamento (PIX, cartão)
- **Webhook**: Recebe notificações de pagamento e atualiza status do pedido automaticamente

### 8.4 Pagar.me
- **Propósito**: Alternativa ao Mercado Pago para pagamentos
- **Funcionalidades**: Boleto, PIX, cartão com parcelamento configurável

### 8.5 Melhor Envio
- **Propósito**: Cotação e geração de etiquetas de múltiplas transportadoras
- **Funcionalidades**: Cotação automática no checkout, geração de etiquetas, rastreamento

### 8.6 Correios
- **Propósito**: Cotação de frete direta via contrato dos Correios
- **Serviços**: PAC, SEDEX

### 8.7 Meus Correios (meuscorreios.app)
- **Propósito**: Geração de etiquetas em massa via API REST
- **Funcionalidades**: Processar vários pedidos de uma vez, gerar PLPs

### 8.8 Mandae
- **Propósito**: Logística e envios
- **Funcionalidades**: Cotação, geração de etiquetas, webhook de rastreamento

### 8.9 Instagram
- **Propósito**: Captura automática de pedidos via comentários em lives
- **Autenticação**: OAuth via Facebook/Instagram Graph API

---

## 9. SUPORTE E IA

### 9.1 Agente IA (Analytics)
- Edge Function `ai-agent` busca TODOS os dados do tenant (sem limite)
- Pré-calcula rankings de top clientes
- Envia contexto completo para Gemini 3 Flash via streaming
- Suporta análise de imagens (produtos, comprovantes)
- Chat com histórico de conversa

### 9.2 Suporte Híbrido
- Widget de chat persistente em todas as páginas
- Roteamento por departamento:
  - **Suporte Técnico**: IA com base de conhecimento
  - **Financeiro**: Redireciona para WhatsApp
  - **Vendas**: Redireciona para WhatsApp
- Base de conhecimento com documentos por tenant + documentos globais
- Escalação para humano após 3 tentativas sem sucesso

---

## 10. COMPONENTES DE UI IMPORTANTES

| Componente | Descrição |
|-----------|-----------|
| `Navbar` | Navegação principal com menu desktop (barra horizontal) e mobile (sheet lateral) |
| `TenantSwitcher` | Dropdown para super_admin trocar entre tenants |
| `TenantLoader` | Loading screen enquanto carrega dados do tenant |
| `EditOrderDialog` | Modal de edição de pedido |
| `ViewOrderDialog` | Modal de visualização detalhada do pedido |
| `ThermalReceipt` | Comprovante térmico para impressão |
| `SupportChatWidget` | Widget de chat de suporte flutuante |
| `WhatsAppSupportButton` | Botão flutuante de suporte via WhatsApp |
| `SendingProgressLive` | Monitor de progresso de envios em tempo real |
| `ShippingOptionsManager` | Gerenciamento de opções de frete customizadas |
| `CouponsManager` | CRUD de cupons de desconto |
| `GiftsManager` | CRUD de brindes |
| `ZoomableImage` | Imagem com zoom ao clicar |

---

## 11. STORAGE (Supabase Storage)

| Bucket | Público | Uso |
|--------|---------|-----|
| `product-images` | ✅ | Imagens dos produtos |
| `tenant-logos` | ✅ | Logos das empresas |
| `knowledge-files` | ✅ | Arquivos da base de conhecimento |

---

## 12. FLUXOS PRINCIPAIS

### 12.1 Fluxo de Venda Live
```
1. Vendedor abre /live
2. Configura evento (data, tipo)
3. Clientes enviam pedidos no WhatsApp/Instagram
4. Vendedor adiciona itens ao carrinho do cliente (por telefone)
5. Sistema envia WhatsApp automático: "Item adicionado!"
6. Vendedor finaliza carrinho → gera pedido
7. Link de pagamento é enviado ao cliente
8. Cliente paga → webhook atualiza pedido → WhatsApp de confirmação
9. Vendedor gera etiqueta de envio
10. Código de rastreio é enviado ao cliente
```

### 12.2 Fluxo SendFlow
```
1. Vendedor seleciona produtos para divulgar
2. Seleciona grupos WhatsApp de destino
3. Sistema cria fila de tarefas (sendflow_tasks)
4. Edge Function processa fila sequencialmente
5. Para cada produto × grupo: envia imagem + descrição
6. Delay de 3 minutos entre produtos (anti-bloqueio)
7. Verifica duplicatas (não envia se já enviou nas últimas 8h)
```

### 12.3 Fluxo de Cobrança em Massa
```
1. Vendedor acessa /whatsapp/cobranca
2. Sistema lista pedidos pendentes (não pagos)
3. Vendedor seleciona pedidos
4. Sistema envia mensagem de cobrança via WhatsApp para cada cliente
5. Delays entre envios para evitar bloqueio
```

---

## 13. CONFIGURAÇÕES E VARIÁVEIS

### Variáveis de ambiente (Supabase Secrets)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `LOVABLE_API_KEY` (para IA)
- `CORREIOS_*` (credenciais Correios)
- `MELHOR_ENVIO_*` (credenciais Melhor Envio)
- `MP_*` (Mercado Pago)
- `BLING_*` (Bling ERP)
- `FACEBOOK_*` / `INSTAGRAM_*` (Instagram)
- `WHATSAPP_API_URL`, `WHATSAPP_MULTITENANT_URL`
- `PUBLIC_BASE_URL`, `PUBLIC_APP_URL`

---

## 14. OBSERVAÇÕES TÉCNICAS

1. **Sem SSR**: O app é uma SPA (Single Page Application) servida pelo Vite. Não usa Next.js em produção.
2. **React Query**: Usado para cache e sincronização de dados. `staleTime` de 5 minutos. `refetchOnWindowFocus` desabilitado.
3. **Wrapper supabaseTenant**: TODA query ao banco DEVE usar este wrapper, nunca o client `supabase` diretamente nos componentes.
4. **Anti-bloqueio WhatsApp**: Delays aleatórios entre envios (configurável), controle de taxa, verificação de duplicatas.
5. **Impressão térmica**: Suporte a impressoras térmicas 80mm via `window.print()` com CSS específico.
6. **Responsividade**: Interface adaptável para mobile e desktop. Menu lateral no mobile, barra horizontal no desktop.
7. **Assinaturas**: Sistema de planos com trial, verificação de acesso via `tenant_has_access()`.
