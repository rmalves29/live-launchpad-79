## Diagnóstico

### Estado atual das integrações (consulta no banco)

| Tenant | Provider | Credenciais | Status |
|---|---|---|---|
| Mania de Mulher (`app`) | uazapi | url + token OK | Único em uazapi |
| OrderZap | baileys | – | API oficial |
| Opalas Joias | zapi | sem credenciais | `is_active=false` |
| 2 órfãos sem slug | baileys | sem credenciais | Sem tenant ligado |
| **Todos os outros 13** (Clara, Luvian, Thay, FL, OF Beauty, Roanne, Nica, Cabello, La Grandame, Elos, Revele, Amar, Carine) | **zapi** | instance + token + client_token | `is_active=true` |

**Conclusão**: a zAPI não está "desativada" no banco — todos os tenants zAPI continuam ativos. O que aparece como "desativado/desconectado" na UI é o **status da sessão WhatsApp** (sessão caída na Z-API ou erro de envio nos fluxos), não a integração.

### Causas reais que estão quebrando o envio nos tenants zAPI

1. **`zapi-broadcast`** — o `select` da função NÃO inclui `uazapi_url` / `uazapi_token`, mas o código checa `integration.uazapi_url`. Para provider `uazapi` o broadcast falha sempre; para provider `zapi` segue funcionando, mas o caminho de uazapi virou armadilha.
2. **Shim `evolution-api.ts`** — hoje só roteia para uazapi. Qualquer função que ainda chama `evoSendText`/`evoSendButton` passando algo que não seja `"<url>|<token>"` (ex.: nome de instância antigo) devolve `success:false`. Precisa virar shim "dual" (zapi OU uazapi) ou cada sender precisa ter os dois caminhos.
3. **Senders `zapi-send-item-added`, `zapi-send-paid-order`, `zapi-send-confirmation-link`, `zapi-send-product-canceled`, `fe-send-message`, `sendflow-process`** — usam o shim para o envio final. Para tenants zAPI eles montam credenciais zAPI, mas chamam o shim assumindo uazapi → falha silenciosa.
4. **Polling de status na tela "Conexão"** — para Mania de Mulher (uazapi) o status retorna "disconnected" quando a sessão cai, e isso é interpretado visualmente como "desativada".

## Plano

### 1. Tornar o shim `_shared/evolution-api.ts` realmente dual
Aceitar dois formatos no parâmetro `instanceName`:
- `"uazapi|<url>|<token>"` → roteia para uazapi (lib `uazapi-api.ts`)
- `"zapi|<instanceId>|<token>|<clientToken>"` → roteia para Z-API (`https://api.z-api.io/instances/.../token/...`)

Funções a re-implementar no caminho zAPI dentro do shim:
`sendText`, `sendButton` (send-button-actions), `sendImage`/`sendImageByUrl` (send-image), `sendAudio`, `sendVideo`, `sendDocument`, `sendLinkMessage`, `sendPresenceAvailable`, `sendPresenceComposing`, `getInstanceStatus`, `getGroupParticipants`, `calcTypingDuration`, `getRandomReactionEmoji`.

### 2. Corrigir `getCredentials` em todos os senders
Padronizar a montagem do `instanceName` para o shim:
- provider `uazapi` → `"uazapi|" + url + "|" + token`
- provider `zapi`  → `"zapi|" + instanceId + "|" + token + "|" + clientToken`

Aplicar em:
- `zapi-send-item-added`
- `zapi-send-paid-order`
- `zapi-send-confirmation-link`
- `zapi-send-product-canceled`
- `zapi-send-tracking`
- `zapi-send-message`
- `zapi-broadcast` (incluir `uazapi_url, uazapi_token` no `select` e usar o shim no envio)
- `fe-send-message`
- `fe-list-groups`
- `sendflow-process`

### 3. Webhook de confirmação SIM/NÃO no uazapi
Hoje a lógica de "responder SIM gera link de pagamento" só está em `zapi-webhook`. Replicar no `uazapi-webhook`:
- Identificar mensagem privada recebida
- Buscar `pending_message_confirmations` por telefone + tenant
- Se resposta = SIM → chamar `zapi-send-confirmation-link`
- Se NÃO → marcar como recusado
- Registrar variantes de telefone (mesma lógica de `buildPhoneVariantsForConfirmation`)
- Atualizar `whatsapp_messages` com status de leitura quando vier `MessageStatusCallback` equivalente

### 4. Status de mensagem (entregue/lido) no uazapi
Replicar `zapi-check-message-status` para uazapi: mapear `messageId` retornado pelo `/send/text` e `/send/media` e atualizar `whatsapp_messages.delivery_status` quando o webhook trouxer eventos `messages_update` ou `messages_ack`.

### 5. Página "Conexão WhatsApp" — diagnóstico visível
Na tela `ConexaoZAPI.tsx`:
- Mostrar badge `is_active` da integração separado do status da sessão
- Quando provider for zapi e `status=error`, exibir o erro retornado pela Z-API (token expirado, instância pausada, etc.) em vez de só "Desconectado"
- Adicionar botão "Testar envio" que dispara `zapi-send-message` para o próprio número conectado e mostra a resposta

### 6. Limpeza
- Remover do `config.toml` a entrada `[functions.evolution-webhook]` (função já deletada)
- Marcar `is_active=false` nos 2 registros órfãos sem tenant (`3438be1b…` e `217ec5a3…`)

### 7. Validação
Após o deploy, testar para um tenant zAPI (sugestão: FL Semi Joias ou Clara Modas) e para Mania de Mulher (uazapi):
- adicionar item em pedido → mensagem de "item adicionado" + botão
- responder SIM → recebe link de checkout
- marcar pedido como pago → recebe confirmação
- atualizar rastreio → recebe código
- disparo em grupo via SendFlow → mensagem entra no grupo

### Detalhes técnicos

- O shim dual mantém as assinaturas atuais; nenhum sender precisa alterar a forma de chamar, só a string passada.
- A Z-API usa URLs `${ZAPI_BASE_URL}/instances/{id}/token/{token}/send-*` com header opcional `Client-Token`.
- O uazapi usa `${url}/send/text|media|presence` com header `token`.
- Manter `_shared/uazapi-api.ts` como hoje; o shim só adiciona o ramo zAPI ao lado.
- Não mexer em `zapi-proxy` (ele já é zAPI-only e é usado na tela de conexão).
- Migrações: nenhuma alteração de schema; apenas um `UPDATE` para desativar os 2 registros órfãos.