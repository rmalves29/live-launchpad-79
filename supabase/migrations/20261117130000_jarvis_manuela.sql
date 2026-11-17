-- Jarvis (antigo Harvey): WhatsApp próprio da Manuela, da Cartzy, e agendamento público.
-- 1) Uma "empresa" técnica só para guardar a instância de WhatsApp do Jarvis na UazAPI.
--    O webhook da UazAPI já identifica a empresa pelo token da instância e grava as mensagens
--    em whatsapp_messages com esse tenant_id. Tudo de loja (live, vitrine, mensagens de pedido) desligado.
-- 2) Leads que agendam pela página /agenda entram em platform_affiliate_leads com origem 'jarvis'
--    (mesma trava de horário, mesmo Google Agenda e mesmos lembretes das afiliadas), agora com e-mail.

insert into public.tenants (id, name, slug, is_active, enable_live, enable_sendflow, enable_loja_live,
                            live_shop_enabled, waitlist_enabled, whatsapp_provider)
values ('a7a1e5c0-7a2c-4b6e-9a11-0a1a2b3c4d5e', 'Jarvis · Manuela (Cartzy)', 'jarvis-manuela', true, false, false, false,
        false, false, 'uazapi')
on conflict (id) do nothing;

-- Mesma UazAPI das empresas (servidor e token de administrador copiados da OrderZap, sem sair do banco).
insert into public.integration_whatsapp (tenant_id, instance_name, webhook_secret, is_active, provider,
  uazapi_url, uazapi_admin_token, send_item_added_msg, send_paid_order_msg, send_product_canceled_msg,
  send_out_of_stock_msg, item_added_button_enabled)
select 'a7a1e5c0-7a2c-4b6e-9a11-0a1a2b3c4d5e', 'jarvis-manuela', gen_random_uuid()::text, true, 'uazapi',
       o.uazapi_url, o.uazapi_admin_token, false, false, false, false, false
  from public.integration_whatsapp o
 where o.tenant_id = 'd5671cfb-9c42-4c44-8f94-0a19a39473d8'
   and not exists (select 1 from public.integration_whatsapp j where j.tenant_id = 'a7a1e5c0-7a2c-4b6e-9a11-0a1a2b3c4d5e')
 limit 1;

alter table public.platform_affiliate_leads add column if not exists email text;
alter table public.platform_affiliate_leads drop constraint if exists platform_affiliate_leads_origem_chk;
alter table public.platform_affiliate_leads add constraint platform_affiliate_leads_origem_chk
  check (origem in ('landing','afiliado','manual','self_signup','jarvis'));
-- Lembrete ao cliente 5 minutos antes (leads do Jarvis), separado do alerta ao Rafael.
alter table public.platform_affiliate_leads add column if not exists client_alert_sent_at timestamptz;

create or replace function public.platform_affiliate_leads_normalize() returns trigger language plpgsql set search_path = public as $$
begin
  new.instagram := platform_norm_instagram(new.instagram);
  new.whatsapp_key := platform_norm_whatsapp(new.whatsapp);
  if tg_op = 'INSERT' or new.status is distinct from old.status then new.status_updated_at := now(); end if;
  if tg_op = 'UPDATE' and new.meeting_at is distinct from old.meeting_at then
    new.alert_sent_at := null; new.link_sent_at := null; new.client_alert_sent_at := null;
  end if;
  return new;
end $$;
