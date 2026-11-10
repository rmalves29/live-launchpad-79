-- Origem legível (Google, Instagram, anúncio, indicação, direto...) no aviso de nova demo ao Rafael.
create or replace function public.agenda_origem_rotulo(r public.agenda_reunioes)
returns text language plpgsql stable set search_path to 'public' as $$
declare
  ref  text := lower(coalesce(r.referrer, ''));
  host text := lower(coalesce(substring(coalesce(r.referrer,'') from '^[a-zA-Z]+://([^/:?#]+)'), ''));
  src  text := lower(coalesce(r.utm_source, ''));
  med  text := lower(coalesce(r.utm_medium, ''));
  camp text := coalesce(' · ' || nullif(r.utm_campaign, ''), '');
begin
  if med ~ '(indica|afiliad|referral|parceir)' or src ~ '(indica|afiliad|parceir)' then
    return 'Indicação (' || coalesce(nullif(r.utm_source,''), r.utm_medium) || ')' || camp;
  end if;
  if r.gclid is not null or r.gbraid is not null or r.wbraid is not null or (src ~ 'google' and med ~ '(cpc|ppc|paid|ads)') then
    return 'Anúncio Google' || camp;
  end if;
  if src ~ '(facebook|^fb$|instagram|^ig$|meta)' and med ~ '(cpc|ppc|paid|ads|social_paid|anuncio)' then
    return 'Anúncio Meta (Facebook/Instagram)' || camp;
  end if;
  if src <> '' then
    return 'Campanha: ' || r.utm_source || coalesce('/' || nullif(r.utm_medium,''), '') || camp;
  end if;
  if r.fbclid is not null or r.fbc is not null then
    return 'Facebook/Instagram (clicou num link ou anúncio)';
  end if;
  if host ~ '(^|\.)google\.' then return 'Google (pesquisa orgânica)'; end if;
  if host ~ 'instagram\.com' then return 'Instagram (link da bio ou post)'; end if;
  if host ~ 'facebook\.com|fb\.me' then return 'Facebook'; end if;
  if host ~ 'whatsapp|wa\.me' then return 'WhatsApp'; end if;
  if host ~ 'youtube\.com|youtu\.be' then return 'YouTube'; end if;
  if host ~ 'tiktok\.com' then return 'TikTok'; end if;
  if host ~ 'bing\.com' then return 'Bing (pesquisa)'; end if;
  if host ~ '(chatgpt\.com|openai\.com|perplexity|gemini\.google|claude\.ai)' then return 'Assistente de IA (' || host || ')'; end if;
  if host <> '' and host !~ 'cartzy\.com\.br' then return 'Outro site: ' || host; end if;
  return 'Direto (digitou o endereço ou abriu um link sem origem, como WhatsApp)';
end $$;

-- O aviso é montado pela edge function agendar-demo (repositório do site); aqui só trocamos a linha "Origem:".
create or replace function public.agenda_whats_rafael(msg text)
returns void language plpgsql security definer set search_path to 'public', 'net' as $function$
declare
  tel text;
  r   public.agenda_reunioes;
begin
  if msg like '%Origem:%' then
    tel := substring(msg from 'Cliente: [^\n]*\((\d{12,13})\)');
    if tel is not null then
      select * into r from public.agenda_reunioes
       where cliente_telefone = tel order by coalesce(agendado_em, created_at) desc limit 1;
      if found then
        msg := regexp_replace(msg, 'Origem: [^\n]*', 'Origem: ' || public.agenda_origem_rotulo(r));
      end if;
    end if;
  end if;
  perform net.http_post(
    url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-send-message',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('tenant_id', public.agenda_cfg('tenant_aviso_rafael'),
                               'phone', public.agenda_cfg('telefone_rafael'), 'message', msg),
    timeout_milliseconds := 60000);
end $function$;
