## Diagnóstico do "número travado"

### Estado real do banco

| Tenant | instance_name | zapi_instance_id | connected_phone (DB) |
|---|---|---|---|
| **OF Beauty** | OF Beauty | `3EE357CFEFA671068B786A3724C122CF` | **NULL** ✅ |
| **MANIA DE MULHER** | MdM | `3EDEE98CBD67B27EEFAABE5CCAAE0F16` | `553496540724` ✅ |

**No banco está limpo e correto** — não há duplicidade, não há "trava" do número entre os tenants.

### Por que a tela da OF Beauty mostra "Número Conectado: 553496540724"

Essa tela busca o número **direto da Z-API** (não do nosso banco). Como a instância Z-API da OF Beauty (`3EE357CFE...`) está com **o mesmo aparelho/chip da MdM (553496540724) conectado fisicamente via QR Code**, a Z-API responde com esse número.

Esse é também o motivo do conflito do webhook que vimos antes: o payload que chega traz `connectedPhone = 553496540724` e nossa função estava roteando pelo telefone em vez do instanceId.

## Para "destravar" / limpar — duas frentes

### Frente 1 — Desconectar o WhatsApp do chip duplicado (ação na Z-API)

Esta é a única forma de o número parar de aparecer na OF Beauty. **Tem que ser feito pelo dono da conta**, não dá pra fazer só pelo banco:

1. Entrar no painel Z-API com a conta da OF Beauty.
2. Acessar a instância `3EE357CFEFA671068B786A3724C122CF`.
3. Clicar em **"Desconectar"** (ou ler o QR Code com **outro celular/chip**, dedicado à OF Beauty).
4. Após desconectar, a Z-API vai parar de enviar `connectedPhone=553496540724` nos webhooks da OF Beauty.

Alternativa rápida via app: também posso adicionar um botão **"Desconectar instância"** na tela de configurações que chama o endpoint `/disconnect` da Z-API, para o cliente fazer isso direto pelo nosso painel.

### Frente 2 — Blindar o sistema para esse cenário não dar problema (ação no código)

Mesmo que o cliente continue com o chip compartilhado por agora, o roteamento do webhook precisa **sempre confiar no `instanceId`** (que é único e correto), nunca no `connectedPhone`:

#### 2.1 — Corrigir `resolveZapiIntegration` em `supabase/functions/zapi-webhook/index.ts`
Inverter a ordem de prioridade: `instanceId` primeiro, `connectedPhone` só como fallback. Em caso de divergência, **manter o tenant do instanceId** e apenas logar (sem trocar de tenant).

#### 2.2 — Migration: índice único parcial em `zapi_instance_id`
```sql
CREATE UNIQUE INDEX idx_integration_whatsapp_zapi_instance_active
  ON integration_whatsapp (zapi_instance_id)
  WHERE is_active = true AND zapi_instance_id IS NOT NULL;
```
Garante que uma mesma instância Z-API nunca possa ser cadastrada como ativa em dois tenants ao mesmo tempo.

#### 2.3 — (opcional) Botão "Limpar número conectado" na tela
Um botão pequeno na seção "Número Conectado" da OF Beauty que chama o endpoint `/disconnect` da Z-API. Após desconectar, o cliente lê o QR Code com o chip correto. Posso incluir junto.

## Resumo do que vou fazer ao aprovar

1. Corrigir `resolveZapiIntegration` no `zapi-webhook` (prioriza instanceId).
2. Criar migration com o índice único.
3. (Se aprovar) Adicionar botão "Desconectar WhatsApp" na tela de configurações da integração WhatsApp, que chama `POST /instances/{instanceId}/token/{token}/disconnect` na Z-API.
4. Te orientar a desconectar a instância da OF Beauty e reler o QR Code com o chip definitivo da OF Beauty.

## O que NÃO vou fazer (e por quê)

- ❌ **Não vou alterar `connected_phone` da MANIA DE MULHER** — está correto, é o número real dela.
- ❌ **Não vou setar `connected_phone` da OF Beauty manualmente** — esse campo deve ser populado automaticamente pela função `fe-list-groups` quando a Z-API reporta o número conectado real. Setar manualmente um número errado só vai mascarar o problema.

---

**Aprova essas 3 ações (correção do webhook + índice único + botão de desconectar)?** Ou prefere que eu faça só as duas primeiras agora e o botão depois?