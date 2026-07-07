## Integração Frenet — Pacote Completo

Integração completa da transportadora Frenet como novo provider dentro do módulo de frete/logística, disponível para todos os tenants, seguindo o padrão das integrações existentes (SuperFrete, Melhor Envio, Mandaê, Correios).

### 1. Banco de dados

Adicionar suporte a Frenet na tabela `shipping_integrations` (já genérica) — nenhum schema novo necessário; apenas garantir que o valor `frenet` seja aceito no enum/coluna `provider`. Se o campo for enum, adicionar via migration:

```sql
ALTER TYPE shipping_provider ADD VALUE IF NOT EXISTS 'frenet';
```

Credenciais armazenadas nas colunas existentes:
- `api_token` → token da Frenet (header `token`)
- `is_active`, `sender_cep`, `sender_*` reutilizados

### 2. Edge Functions (novas)

Todas com CORS padrão, validação Zod, retorno HTTP 200 `{success,error}` em falha:

1. **`frenet-calculate-shipping`** — cotação em tempo real
   - `POST https://api.frenet.com.br/shipping/quote`
   - Payload: SellerCEP, RecipientCEP, ShipmentInvoiceValue, ShippingItemArray (peso/altura/largura/comprimento/qtd)
   - Retorna array de serviços com `ServiceCode`, `ServiceDescription`, `ShippingPrice`, `DeliveryTime`
   - Consumido pelo checkout via `get-shipping-options` (integrar como novo case)

2. **`frenet-create-shipping`** — geração de etiqueta
   - `POST https://api.frenet.com.br/shipping/dispatch` (cria despacho)
   - `POST https://api.frenet.com.br/tracking/trackinginfo` (retorna PDF/URL)
   - Salva `melhor_envio_tracking_code` (campo genérico já usado) e `shipping_label_url` no pedido
   - Trigger existente `send_tracking_whatsapp_on_update` dispara WhatsApp automaticamente

3. **`frenet-track-shipment`** — polling de rastreio
   - `POST https://api.frenet.com.br/tracking/trackinginfo` com `ShippingServiceCode` + `TrackingNumber`
   - Atualiza `order_status` conforme eventos
   - Agendada via `pg_cron` a cada 2h (mesmo padrão do Bling tracking)

4. **`frenet-list-services`** — auxiliar
   - Lista serviços contratados na conta (`GET /shipping/info`) para popular tela de configuração

### 3. Integração no checkout

Ajustar `supabase/functions/get-shipping-options/index.ts` (ou equivalente que agrega providers) para:
- Detectar `provider = 'frenet'` em `shipping_integrations` ativo
- Chamar `frenet-calculate-shipping` internamente
- Normalizar resposta ao formato universal usado pelo storefront

### 4. UI de configuração

Nova aba/card em **Configurações → Integrações → Frete**:
- Componente `FrenetIntegration.tsx` seguindo padrão de `MelhorEnvioIntegration.tsx`
- Campos: Token API, CEP remetente, dimensões padrão, seleção de serviços
- Botões: Testar conexão, Salvar, Ativar/Desativar (exclusividade com outros providers de frete)
- Listagem de serviços via `frenet-list-services`

### 5. Notificação WhatsApp

Nenhuma mudança — trigger `send_tracking_whatsapp_on_update` já dispara `zapi-send-tracking` quando `melhor_envio_tracking_code` é preenchido, funcionando para qualquer provider.

### 6. Cron job (rastreio)

```sql
SELECT cron.schedule(
  'frenet-tracking-sync', '0 */2 * * *',
  $$ SELECT net.http_post(url:='.../functions/v1/frenet-track-shipment', ...) $$
);
```

### 7. Segredo necessário

Nenhum segredo global — o token é per-tenant, armazenado em `shipping_integrations.api_token` (padrão já usado). Nada a adicionar via `add_secret`.

### Ordem de execução

1. Migration `ALTER TYPE` (se necessário) + validação da estrutura de `shipping_integrations`
2. Edge functions (4 novas) em paralelo
3. Ajuste no `get-shipping-options` para rotear Frenet
4. UI `FrenetIntegration.tsx` + registrar na página de integrações de frete
5. Cron de rastreio
6. Teste ponta-a-ponta: configurar token → cotar CEP no checkout → gerar etiqueta em pedido pago → confirmar WhatsApp de rastreio

### Pergunta pendente (não bloqueia início)

O token da Frenet será cadastrado depois pela tela de integrações — sem token não consigo validar cotação real, mas todo o código fica pronto e testável assim que o token for salvo.
