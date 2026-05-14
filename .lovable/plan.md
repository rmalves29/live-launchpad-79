
# Integração Sipag (Sicoob) como gateway de pagamento

Vou seguir exatamente o mesmo padrão das integrações Pagar.me, Appmax e InfinitePay já existentes no projeto, garantindo consistência de UX, exclusividade mútua entre gateways e reaproveitamento da rota universal `/pagamento/retorno`.

## 1. Banco de dados

Migração criando a tabela `integration_sipag` e ajustando o trigger de exclusividade mútua.

- `integration_sipag` (uma linha por tenant):
  - `tenant_id` UUID UNIQUE
  - `client_id`, `client_secret` (texto, criptografado em repouso pelo Supabase)
  - `merchant_id`, `terminal_id`
  - `certificate_base64` (o `.pfx` codificado — armazenado no banco para o tenant; a alternativa seria secret global, mas como cada tenant tem o seu, fica em tabela)
  - `certificate_password`
  - `pix_key` (chave PIX recebedora cadastrada no Sicoob)
  - `enable_pix`, `enable_credit_card`, `enable_boleto` (booleans)
  - `webhook_secret` (gerado por nós para validar callbacks)
  - `environment` ('production' fixo agora; campo já preparado caso queira sandbox depois)
  - `is_active` boolean
- Política RLS igual às outras tabelas `integration_*` (tenant vê o seu, super_admin vê tudo).
- Atualizar a função `deactivate_other_payment_integrations()` para incluir `integration_sipag` na regra de exclusividade mútua junto com MP, Pagar.me, Appmax e InfinitePay.
- Trigger `BEFORE INSERT OR UPDATE OF is_active` em `integration_sipag` para chamar essa função.

## 2. Edge Functions

Quatro funções novas em `supabase/functions/`:

| Função | Responsabilidade |
|---|---|
| `create-sipag-payment` | Recebe `order_id` + método (`pix`/`credit_card`/`boleto`), busca credenciais do tenant, autentica via OAuth2 + mTLS no Sipag, cria a cobrança e devolve `payment_link`/QR Code/linha digitável. Aplica desconto PIX e respeita o cálculo de total da memória `[Total do Pedido]`. |
| `sipag-webhook` | Endpoint público que recebe callbacks do Sicoob, valida assinatura via `webhook_secret`, marca `orders.is_paid = true`, dispara confirmação WhatsApp existente. Retorna 200 sempre (padrão da memória). |
| `sipag-cancel-payment` | Solicita estorno (PIX devolução / cartão chargeback). Usa o trigger `cancelamento-automatico-por-estorno` já existente. |
| `sipag-test-connection` | Botão na UI para validar credenciais + certificado antes de salvar `is_active=true`. |

Todas seguindo o padrão do projeto:
- CORS headers conforme memória `[CORS Edge Functions]`
- Retorno HTTP 200 com `{success, error}` em falhas
- Auth via service role internamente
- mTLS via `Deno.createHttpClient({ caCerts, cert, key })` — extraindo cert/key do `.pfx` em runtime

## 3. Frontend

Novo arquivo `src/components/integrations/SipagIntegration.tsx` espelhando o `PagarMeIntegration.tsx`:
- Formulário com campos do tenant (incluindo upload do `.pfx` convertido para base64)
- Toggle de ativação (avisa que desativa os outros gateways)
- Switches para PIX / Cartão / Boleto
- Botão "Testar conexão"

Atualizar `src/components/TenantIntegrationsPage.tsx`:
- Importar `SipagIntegration`
- Adicionar nova `<TabsTrigger value="sipag">` com ícone `Building2` ou `Landmark`
- Adicionar `<TabsContent value="sipag">`
- Adicionar query `sipagIntegration` para mostrar o ✓ verde quando ativa

## 4. Checkout

Em `src/pages/pedidos/PublicCheckout.tsx` (e onde mais o checkout escolhe gateway):
- Detectar se o tenant tem `integration_sipag.is_active = true`
- Listar os métodos habilitados (PIX/Cartão/Boleto) como opções
- No submit, chamar `create-sipag-payment` em vez do gateway atual
- Reutilizar o retorno universal `/pagamento/retorno` (memória `[Retorno Universal]`)

## 5. Pré-requisitos do usuário (fora do código)

Você precisa providenciar antes de ativar em produção:
1. Conta PJ Sicoob com **credenciamento e-commerce ativo** (solicitar na agência)
2. Acesso ao portal https://developers.sicoob.com.br
3. `client_id`, `client_secret`, `merchant_id`, `terminal_id` de produção
4. Certificado digital `.pfx` + senha
5. Chave PIX recebedora cadastrada
6. URL do webhook a cadastrar no painel Sicoob (vou te passar pronta após deploy: `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/sipag-webhook`)

## Detalhes técnicos

```
Fluxo PIX (mais simples - implementar primeiro)
─────────────────────────────────────────────
Checkout → create-sipag-payment
  ├─ busca integration_sipag pelo tenant_id
  ├─ POST /auth/oauth/v2/token (client_credentials, mTLS)
  ├─ POST /pix/api/v2/cob (cria cobrança imediata)
  ├─ GET  /pix/api/v2/cob/{txid}/qrcode
  └─ retorna { qr_code_base64, copia_e_cola, expires_at }
        ↓
Cliente paga PIX
        ↓
Sicoob → POST /sipag-webhook
  ├─ valida assinatura HMAC
  ├─ UPDATE orders SET is_paid=true WHERE id=...
  └─ trigger process_paid_order já dispara WhatsApp
```

## Ordem de implementação sugerida

1. Migração da tabela + trigger de exclusividade
2. Edge function `create-sipag-payment` (apenas PIX inicialmente)
3. Edge function `sipag-webhook`
4. UI `SipagIntegration.tsx` + aba na página de integrações
5. Edge function `sipag-test-connection`
6. Integração no `PublicCheckout`
7. Adicionar Cartão de Crédito (após PIX validado em produção)
8. Adicionar Boleto

## O que NÃO vai mudar

- Tabela `orders`, fluxo de cancelamento, cálculo de total, rota de retorno, mensagens WhatsApp, integração ERP (Bling) — tudo continua funcionando igual; o Sipag entra como mais uma opção plugada na arquitetura existente.
