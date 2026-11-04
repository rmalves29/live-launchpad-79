# Afiliados: indicação com agendamento, funil de leads e comissão por links recorrentes

## Decisões que preciso que você confirme
1. **Google Agenda**: em vez de criar um app OAuth próprio e guardar refresh token, usar o conector Google Calendar do Lovable (login com a sua conta, renovação automática do acesso). Se o conector não puder ser ligado a este projeto (Supabase externo), volto ao plano original: você cria o app OAuth no Google Cloud e eu peço `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REFRESH_TOKEN` pelo formulário seguro.
2. **Job a cada minuto** (alerta 5 min antes + link do Meet na hora): roda 1.440 vezes por dia, mesmo sem reunião, gastando recursos do banco. Alternativa mais leve: a cada 5 min (288/dia), com atraso máximo de 5 min no envio do link. Plano assume **a cada minuto**, como você pediu.

## 1. Banco
- `platform_affiliate_leads`: novos campos empresa, instagram, whatsapp_key, vende_live, status (6 valores, default 'indicado'), meeting_at, meeting_link, google_event_id, notas, origem, status_updated_at, alert_sent_at, link_sent_at.
- Normalização no banco (trigger): instagram minúsculo sem @/URL; whatsapp_key só dígitos com 55 e nono dígito.
- Proteção 60 dias (first wins) em função SECURITY DEFINER com lock: retorna "Esse contato já foi indicado"; para super_admin inclui o nome da afiliada.
- Horário único: índice único em meeting_at para leads com reunião ativa + lock no agendamento.
- `platform_affiliate_settings`: agenda (dias, 09:00–18:00, America/Sao_Paulo, antecedência 2h, 14 dias, 30 min).
- `tenants`: billing_phone, billing_email.
- Nova tabela `platform_pagarme_customer_map` (customer/subscription → tenant) e `platform_unmatched_payments` (pagamentos sem empresa).

## 2. Landing /indicacao e /i/:codigo
- Formulário: nome, empresa, WhatsApp, @Instagram, vende em live, escolha de dia/horário (slots livres vindos do servidor).
- Nova função `affiliate-booking` (pública): lista horários, agenda, cria evento com Meet (se Google conectado; senão salva e marca aviso), envia confirmação pela instância OrderZap (mesmo envio do pré-cadastro).
- Função `affiliate-meeting-reminders` (job): alerta ao aprovador 5 min antes e link do Meet ao lead na hora.

## 3. Painel /afiliado
- Botão "Indicar empresa" (origem 'afiliado') com checkbox "enviar link de agendamento pelo WhatsApp".
- Lista "Minhas indicações": nome, empresa, status, data da reunião — só dos próprios leads.

## 4. Admin /admin/afiliados — aba "Leads e reuniões"
- Kanban por status com filtros (afiliada, status); mudar status, notas, reagendar/cancelar (atualiza Google).
- Config da agenda e status da conexão Google; aviso de reuniões sem evento.
- Seção "Pagamentos sem empresa vinculada" com botão "Vincular a empresa" (cria mapeamento + comissões retroativas).

## 5. Fechamento
- Pré-cadastro e Nova Empresa: ao digitar WhatsApp/@Instagram, busca lead (60 dias) e mostra "Indicação de {afiliada}", preenchendo "Indicado por"; campos de telefone/e-mail de cobrança.
- Ao criar empresa: tenants.affiliate_id, lead.tenant_id, status 'fechado'.

## 6. Comissão com links recorrentes
- Investigar qual webhook recebe as cobranças dos `pagarme_recurring_links` (provável `pagarme-subscription-webhook`).
- Casar pagador (e-mail, telefone, CPF/CNPJ) com tenant (admin_email, cobrança, contact_phone, cnpj); gravar mapeamento, lead 'pagando', comissão pelas regras atuais (idempotente por payment_ref). Sem casamento → registro "sem empresa vinculada".

## Testes
Dados fictícios ponta a ponta, sem WhatsApp real e sem evento real (envios simulados), testes automatizados das regras (normalização, 60 dias, horário duplicado, casamento de pagador, idempotência), e limpeza no final. Nada publicado sem você pedir.

## No final informo
O que configurar (Google, horários) e quais webhooks mudaram.
