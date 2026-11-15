# Olist: agendamento autenticado e isolamento entre lojas

O agendamento antigo enviava a chave pública e recebia HTTP 403. A correção usa um segredo exclusivo no Vault e um validador que só `service_role` pode executar. Nenhuma chave administrativa do projeto foi copiada para o cron, navegador ou repositório.

## Ordem da publicação

1. Aplicar `olist_cron_scoped_credential`: cria a credencial aleatória e guarda o comando anterior no Vault para reversão.
2. Publicar `olist-orders` com os mesmos arquivos compartilhados existentes. Preservar `verify_jwt = false`: o código valida a identidade; login normal continua passando pelo guard de loja.
3. Fazer `auto_sweep` com `dry_run: true`, usando o segredo dentro do servidor. Exigir HTTP 200 e `authorized: true`; segredo incorreto deve receber 403. O dry run não consulta pedidos, não envia nada e não atualiza rastreios.
4. Aplicar `olist_cron_activate`. Preserva frequência e estado do agendamento. Credencial é lida do Vault em cada execução.
5. Aplicar `olist_cron_fair_store_rotation` antes de publicar a versão com ordenação por `orders_last_sweep_at`.
6. Observar respostas HTTP e o resultado `auto_sweep`, além da conclusão registrada pelo agendador. A conclusão SQL sozinha não confirma sincronização.

## Todas as lojas e crescimento

Não existe lista fixa de empresas. A rotina seleciona integrações ativas com envio habilitado e alguma automação ligada. Credenciais e regras continuam sendo carregadas por `tenant_id`, inclusive nas chamadas ao ERP e na renovação de tokens. Lojas novas precisam autorizar sua própria conta e habilitar os recursos desejados; não recebem as credenciais de outra empresa.

O limite é de 50 lojas por rodada e 100 segundos de processamento. A ordenação prioriza lojas ainda não verificadas e depois as mais antigas, com desempate pelo identificador. Cada tentativa registra seu horário por loja antes de processar. Assim, uma loja além das primeiras 50 é atendida numa rodada posterior. Isso não representa garantia de latência ou capacidade ilimitada; com mais lojas é necessário medir a fila e o tempo de cada integração.

Frete Barato também resolve conta, plataforma e token por loja. Testes novos cobrem duas contas simultâneas, uma loja futura e ausência de configuração, sem fallback para credenciais de terceiros. Cotação real exige conta válida, cobertura, CEP e medidas corretos.

## Validação

`node --experimental-strip-types --test tests/fretebarato.test.mjs tests/fretebarato-tenants.test.mjs tests/olist-cron.test.mjs tests/olist-tenants.test.mjs`

Os testes Olist utilizam TypeScript para executar o ponto de entrada real com SDK e provedores simulados. Opcionalmente, `TYPESCRIPT_PATH` aponta para uma instalação de ferramentas local. Há cobertura de credenciais erradas, falha do validador, compatibilidade interna, permissões da loja, dry run sem efeitos, lojas desativadas e rotação com mais de 50 lojas. As mudanças não alteram critérios de pagamento, corte de histórico, emissão de notas ou flags de integração.

## Reversão

Restaurar o comando anterior do Vault com `cron.alter_job`, sem imprimir seu conteúdo. Manter a frequência e o estado existentes. Se for necessário restaurar a função, usar o bundle anterior salvo administrativamente; a versão anterior continuará recusando o agendamento público, retornando ao comportamento de falha conhecido. Não apagar segredos nem a coluna de controle como parte de uma reversão emergencial.

As três migrations não modificam os registros de pedidos. A rotina normal, depois de ativada, volta a executar as automações já habilitadas por cada loja.

Referência: https://supabase.com/docs/guides/functions/schedule-functions
