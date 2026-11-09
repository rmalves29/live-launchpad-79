create or replace function public.correios_rotulo(_tenant_id uuid, _pre_postagem text, _layout text default null, _recibo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c record;
  tok text;
  resp http_response;
  rec text := nullif(trim(coalesce(_recibo, '')), '');
  corpo text;
  j jsonb;
  i int;
  basic text;
begin
  select client_id, client_secret, refresh_token, scope into c
  from shipping_integrations where tenant_id = _tenant_id and provider = 'correios' limit 1;
  if c is null or coalesce(c.client_id, '') = '' or coalesce(c.client_secret, '') = '' or coalesce(c.refresh_token, '') = '' then
    return jsonb_build_object('status', 'erro', 'mensagem', 'Integração Correios não configurada');
  end if;

  perform http_set_curlopt('CURLOPT_TIMEOUT', '4');
  basic := 'Basic ' || replace(encode(convert_to(c.client_id || ':' || c.client_secret, 'utf8'), 'base64'), E'\n', '');
  resp := http(('POST', 'https://api.correios.com.br/token/v1/autentica/cartaopostagem',
    array[http_header('Authorization', basic)], 'application/json',
    json_build_object('numero', c.refresh_token)::text)::http_request);
  if resp.status not in (200, 201) and coalesce(c.scope, '') <> '' then
    resp := http(('POST', 'https://api.correios.com.br/token/v1/autentica/cartaopostagem',
      array[http_header('Authorization', basic)], 'application/json',
      json_build_object('numero', c.refresh_token, 'contrato', c.scope)::text)::http_request);
  end if;
  begin tok := (resp.content::jsonb)->>'token'; exception when others then tok := null; end;
  if tok is null then
    return jsonb_build_object('status', 'erro', 'mensagem', 'Falha na autenticação dos Correios (' || resp.status || ')');
  end if;

  if rec is null then
    corpo := case when _layout = 'zebra'
      then json_build_object('idsPrePostagem', json_build_array(_pre_postagem), 'tipoRotulo', 'P', 'layoutImpressao', 'LINEAR_100_150')::text
      else json_build_object('idsPrePostagem', json_build_array(_pre_postagem), 'tipoRotulo', 'P')::text end;
    resp := http(('POST', 'https://api.correios.com.br/prepostagem/v1/prepostagens/rotulo/assincrono/pdf',
      array[http_header('Authorization', 'Bearer ' || tok)], 'application/json', corpo)::http_request);
    if resp.status >= 300 then
      return jsonb_build_object('status', 'erro', 'http', resp.status, 'mensagem', left(coalesce(resp.content, ''), 500));
    end if;
    begin rec := (resp.content::jsonb)->>'idRecibo'; exception when others then rec := null; end;
    if rec is null then
      return jsonb_build_object('status', 'erro', 'mensagem', 'Correios não devolveram o recibo: ' || left(coalesce(resp.content, ''), 200));
    end if;
  end if;

  for i in 1..3 loop
    resp := http(('GET', 'https://api.correios.com.br/prepostagem/v1/prepostagens/rotulo/download/assincrono/' || rec,
      array[http_header('Authorization', 'Bearer ' || tok)], null, null)::http_request);
    begin j := resp.content::jsonb; exception when others then j := null; end;
    if resp.status = 200 and j is not null and length(coalesce(j->>'dados', '')) > 100 then
      return jsonb_build_object('status', 'ok', 'recibo', rec, 'dados', j->>'dados');
    end if;
    if coalesce(j->>'mensagem', '') ~* '(PPN-295|PPN-297|nova solicita)' then
      return jsonb_build_object('status', 'falha', 'recibo', rec, 'mensagem', j->>'mensagem');
    end if;
    if i < 3 then perform pg_sleep(1); end if;
  end loop;
  return jsonb_build_object('status', 'pendente', 'recibo', rec);
end;
$$;

revoke all on function public.correios_rotulo(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.correios_rotulo(uuid, text, text, text) to service_role;