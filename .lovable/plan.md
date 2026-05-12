## Contexto

Cliente da **Roanne Jóias** (`tenant_id=014457e5-e85f-4d62-874b-6bd0b72213bc`, slug `roannejoias`) escolhe PIX no nosso checkout, mas ao ser redirecionado para o Mercado Pago só aparece a opção de cartão.

## O que já verifiquei

1. **Integração MP da Roanne está ativa** (`is_active=true`, `environment=production`, token `APP_USR-...` 75 chars).
2. **A trava de método está sendo aplicada corretamente.** Os logs do `create-payment` mostram:
   - `[pix-discount] tenant=014457e5... method=pix subtotal=89.00 percent=15%`
   - `[payment-method-lock] provider=mercado_pago choice=pix → applying lock`
3. **Não há erros do MP** (`MP error` não aparece nos logs) — a preferência é criada normalmente.
4. **Código atual** (`supabase/functions/_shared/payment-method-lock.ts`) para PIX envia ao MP:
   ```json
   "payment_methods": {
     "excluded_payment_types": [
       {"id":"credit_card"},{"id":"debit_card"},{"id":"ticket"},{"id":"atm"}
     ],
     "excluded_payment_methods": [
       {"id":"bolbradesco"},{"id":"pec"}
     ]
   }
   ```
   Isso deveria deixar **só PIX** disponível. Não definimos `default_payment_method_id=pix` propositalmente, justamente para evitar o erro "invalid default_payment_method_id" quando a conta MP não tem PIX habilitado.

## Hipótese principal

A conta Mercado Pago da Roanne provavelmente **não tem o PIX habilitado** (precisa ativar na conta vendedor: chave PIX cadastrada + meio de cobrança PIX ativo). Quando isso acontece, o MP **ignora as exclusões de tipos** e mostra apenas o que está disponível na conta — no caso, cartão.

Outras lojas (FL Semi Joias, Revele etc.) provavelmente continuam funcionando porque têm PIX ativo na conta MP delas.

## Plano de verificação e correção

### 1. Confirmar se PIX está habilitado na conta MP da Roanne
Criar uma edge function temporária de diagnóstico (`mp-diagnose`) que, recebendo o `tenant_id`, chama `GET https://api.mercadopago.com/v1/payment_methods` com o token da loja e retorna a lista de métodos com `status=active`. Se `pix` não aparecer ou estiver `inactive`, confirma a hipótese.

### 2. Se PIX não estiver habilitado na conta MP
- Orientar a Roanne a ativar o PIX na conta Mercado Pago dela (Configurações → Meios de cobrança → PIX → cadastrar chave). Sem isso, nenhuma trava no nosso lado resolve.
- **Adicionar uma proteção no `create-payment`**: antes de criar a preferência com lock de PIX, verificar se a conta MP do tenant tem PIX ativo (cache em memória curto). Se não tiver, retornar HTTP 200 com `{success:false, error:"PIX não habilitado na conta Mercado Pago da loja. Ative em Configurações → Meios de cobrança."}` — assim o frontend mostra mensagem clara em vez de mandar o cliente para um checkout que vai cobrar cartão (e desconto PIX indevido).

### 3. Se PIX estiver habilitado mas mesmo assim só cartão aparece
- Nesse caso o problema é a forma como o MP interpreta o payload. Adicionar `default_payment_method_id: "pix"` junto às exclusões e testar. Se MP retornar erro, é diagnóstico definitivo de PIX desativado.
- Alternativa: usar `purpose: "wallet_purchase"` ou definir `payment_methods.installments: 1` e revisar se algum item negativo (desconto) está disparando fallback do MP.

### 4. Remover edge function de diagnóstico após a verificação.

## Detalhes técnicos

**Arquivos envolvidos:**
- `supabase/functions/create-payment/index.ts` (linhas 935–964) — bloco MP
- `supabase/functions/_shared/payment-method-lock.ts` — lógica de exclusão por método
- Nova edge function temporária: `supabase/functions/mp-diagnose/index.ts`

**Sem mudanças de schema.** Tudo é em edge functions + (no passo 2) uma melhoria de UX com retorno HTTP 200 + JSON de erro amigável (segue a convenção do projeto registrada em memória).

## Pergunta ao usuário antes de implementar

Posso seguir com o passo 1 (criar a edge function de diagnóstico e rodar para a Roanne) para confirmar se o problema é PIX desabilitado na conta MP dela?