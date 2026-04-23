

## Replicar templates da Mania de Mulher em toda empresa nova

### Resposta direta à dúvida

**Sim, fica automático.** Vou criar uma função no banco que dispara sozinha toda vez que uma empresa nova é cadastrada — você não precisa rodar nada manual depois.

### O que será replicado (cópia exata da Mania de Mulher)

**1. Templates da tabela `whatsapp_templates`** (8 templates)
- `ITEM_ADDED` — Item Adicionado ao Pedido
- `PAID_ORDER` — Pedido Pago
- `PRODUCT_CANCELED` — Produto Cancelado
- `TRACKING` — Código de Rastreio
- `BLOCKED_CUSTOMER` — Mensagem de Cliente Bloqueado
- `MSG_MASSA` — Mensagem em Massa
- `SENDFLOW` — Divulgação em Grupos
- `DM_INSTAGRAM_CADASTRO` — Cadastro Sistema

**2. Campos de template/flags de `integration_whatsapp`** (apenas configurações, sem credenciais Z-API)
- `template_solicitacao`, `template_com_link`, `template_item_added`, `item_added_confirmation_template`
- `blocked_customer_template`
- `send_item_added_msg`, `send_paid_order_msg`, `send_product_canceled_msg`, `send_out_of_stock_msg`
- `confirmation_timeout_minutes` (30 min)
- `consent_protection_enabled`

### O que NÃO será replicado (continua zerado / configurado pela empresa)

- Credenciais Z-API (`zapi_instance_id`, `zapi_token`, `zapi_client_token`, `instance_name`, `webhook_secret`, `connected_phone`)
- Qualquer integração externa (Bling, Mercado Pago, Pagar.me, InfinitePay, Melhor Envio, Correios, Olist, Omie, Bagy, Instagram)
- Presentes, cupons, opções de frete customizado, produtos, clientes, pedidos
- Flags do tenant (`enable_live`, `enable_sendflow`, `plan_type`, etc.)

### Como vai funcionar tecnicamente

1. **Função `clone_mania_de_mulher_templates(new_tenant_id uuid)`** no banco — copia os 8 templates de `whatsapp_templates` e cria a linha em `integration_whatsapp` com os campos de template/flags da Mania de Mulher (gerando `instance_name` e `webhook_secret` únicos vazios para a nova empresa).
2. **Trigger `AFTER INSERT ON tenants`** — chama a função automaticamente. Toda empresa nova nasce com os templates já configurados.
3. **Idempotência**: a função verifica se a nova empresa já tem templates antes de inserir, então rodar de novo não duplica nada.
4. **Variáveis dinâmicas**: os templates usam `{{produto}}`, `{{nome}}`, `{{order_id}}`, etc. — esses placeholders são resolvidos em runtime pelo SendFlow/zapi-send-*, então cada empresa preenche com os próprios dados sem precisar editar o template.

### Empresas já existentes

Não serão afetadas — a trigger só dispara em `INSERT`. Se você quiser, posso rodar uma vez manualmente para empresas específicas que ainda estão sem templates (me diga quais).

### Validação após deploy

Criar uma empresa de teste em `/empresas` → entrar em **Configurações → WhatsApp** → confirmar que os 8 templates aparecem listados e os flags estão como na Mania de Mulher, com os campos de credencial Z-API vazios.

### Detalhes técnicos

- 1 migração SQL: cria função `clone_mania_de_mulher_templates(uuid)` + trigger `trg_clone_templates_on_new_tenant` em `tenants`
- Tenant fonte hardcoded: `08f2b1b9-3988-489e-8186-c60f0c0b0622` (Mania de Mulher)
- Sem alterações em frontend nem em edge functions

