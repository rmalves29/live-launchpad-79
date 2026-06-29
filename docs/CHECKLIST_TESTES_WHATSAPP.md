# Checklist de Testes — APIs WhatsApp (Z-API + Evolution)

## 1. Conexão básica
- [ ] **Z-API**: instância aparece como `Conectada` em Configurações → WhatsApp, `connected_phone` preenchido.
- [ ] **Evolution**: instância criada, QR escaneado, status `open` no painel.
- [ ] Reabrir o painel após 5 min e confirmar que a sessão **não caiu**

## 2. Recebimento de mensagens (cliente → sistema)
- [ ] Enviar mensagem privada de um número novo → chega no painel como **Conversa** nova
- [ ] Enviar mensagem em grupo onde o bot está → chega como entrada no **Grupos**
- [ ] Enviar código de produto (ex: `C123`) → sistema reconhece e adiciona ao carrinho
- [ ] Enviar código composto (ex: `C123x2`) → sistema adiciona **2 unidades**
- [ ] Enviar mensagem com foto → mídia aparece na conversa (se aplicável)

## 3. Envio de mensagens (sistema → cliente)
- [ ] Adicionar item ao pedido → cliente recebe mensagem **"Item adicionado"** no privado
- [ ] Alterar status do pedido → cliente recebe notificação de status
- [ ] Enviar mensagem manual pelo painel → chega no WhatsApp do cliente
- [ ] **Z-API**: envio de mensagens em massa (SendFlow) funciona sem bloqueio
- [ ] **Evolution**: envio de mensagens em massa (SendFlow) funciona sem bloqueio

## 4. Grupos (Evolution — MANIA DE MULHER)
- [ ] Alguém entra no grupo → bot envia **mensagem de boas-vindas** (se configurado)
- [ ] Alguém sai do grupo → bot envia **mensagem de despedida** (se configurado)
- [ ] Bot reage corretamente a eventos de `GROUP_PARTICIPANTS_UPDATE`
- [ ] Mensagens do grupo chegam ao painel corretamente

## 5. Webhooks & Integrações
- [ ] **Z-API**: webhook configurado com URL correta, eventos ativos
- [ ] **Evolution**: webhook reconfigurado com todos os eventos necessários:
  - `MESSAGES_UPSERT`
  - `GROUP_PARTICIPANTS_UPDATE`
  - `GROUP_UPDATE`
  - `CONNECTION_UPDATE`
- [ ] Eventos duplicados não geram ações duplicadas (proteção de duplicação)
- [ ] Timeout de 4s nos triggers respeitado — sem erros de timeout

## 6. Notificações automáticas
- [ ] Pedido pago → notificação de confirmação enviada
- [ ] Rastreio atualizado → cliente recebe atualização de envio
- [ ] Cliente bloqueado → mensagem automática de aviso enviada
- [ ] Pedido cancelado → notificação de cancelamento enviada (sem cancelar automaticamente em caso de estorno)

## 7. Resiliência & Erros
- [ ] Sessão cai e reconecta → webhook continua funcionando
- [ ] Número de telefone mal formatado → sistema normaliza corretamente (preserva DDD)
- [ ] Cliente sem nome → preenchimento automático funciona (se configurado)
- [ ] Duplicidade de telefone → sistema não cria cliente duplicado

## 8. Multi-tenant & Segurança
- [ ] Grupos de um tenant **não aparecem** em outro tenant
- [ ] Mensagens de um tenant **não cruzam** para outro tenant
- [ ] RLS (`tenant_id`) filtra corretamente todas as consultas

## 9. Performance
- [ ] Envio em massa de 50+ mensagens → sem bloqueio, com delays humanizados
- [ ] Webhook processa em menos de 4s (fast-path async)
- [ ] Fotos de perfil em sorteio → fallback para avatar funciona se API falhar

---

## Observações

| Empresa | Situação Observada |
|---------|-------------------|
| Amar Biquini | `send_item_added_msg = false` — intencionalmente desabilitado |
| OF Beauty | `send_item_added_msg = false` — intencionalmente desabilitado |
| Opalas Joias | `is_active = false` — não usa WhatsApp |
| Cabello Mania, Carine Prudêncio, Elos, Nica Brasil | Sem `connected_phone` — QR Code nunca escaneado |
| Revele Semi Jóias | Último check em 27/abr — sessão provavelmente caída |
| La Grandame | Último check em 08/jun — sessão provavelmente caída |

---

## Resultado Final

| Provider | Status |
|----------|--------|
| Z-API | ⬜ Pendente |
| Evolution | ⬜ Pendente |

**Testado por:** _______________  
**Data:** _______________  
**Observações gerais:**
