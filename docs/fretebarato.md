# Frete Barato: cotação no checkout

Disponibiliza preço e prazo nos checkouts interno e público, usando o cadastro existente de integrações por loja. Não inclui pedidos, etiquetas, notas fiscais ou rastreamento.

## Publicação e configuração

1. Sincronize o código no Lovable e publique o frontend.
2. Publique também as Edge Functions `fretebarato-settings` e `fretebarato-shipping`, com a configuração de `supabase/config.toml`. A atualização somente do frontend não publica necessariamente essas funções.
3. Em Integrações > Frete Barato, informe o Customer ID completo (pode conter letras e até 80 caracteres), identificação da plataforma e CustomerToken fornecidos pela equipe do Frete Barato. Também é possível colar o link completo de cotação no campo da plataforma e deixar Customer ID vazio: o servidor extrai e salva os dois valores. Se ambos estiverem preenchidos, os IDs precisam coincidir. Não coloque tokens no código, no GitHub ou em variáveis públicas do frontend.
4. Salve e ative. O limite existente de duas integrações de frete ativas por loja continua sendo aplicado pelo banco.
5. Use o teste por CEP e confira uma cotação nos dois checkouts. O teste da tela usa um pacote de 300 g, 20 × 16 × 2 cm e R$ 50. A origem e os serviços habilitados seguem a conta no Frete Barato.

Não há migração de banco. Em `shipping_integrations`, o provedor é `fretebarato`, `client_id` guarda Customer ID, `scope` guarda a plataforma e `access_token` guarda o token. Uma configuração nova começa desativada. O token salvo não é devolvido pela função de configurações; o campo vazio mantém o valor atual.

## Contrato e proteção

A função pública de cotação valida a loja ativa, a integração ativa, o CEP completo, quantidades, valores, dimensões e pesos. Aplica limite de requisições e tempo máximo de dez segundos. O destino HTTP é fixo no domínio oficial; plataforma e Customer ID são validados. Erros não devolvem credenciais ou o corpo da resposta do fornecedor.

A função de configurações exige autenticação e autorização para a loja através do guard compartilhado. O checkout recebe somente opções normalizadas, sem token. Preços são em reais, dimensões em centímetros inteiros e peso em quilogramas com três casas decimais. Frete gratuito é preservado. O checkout público mantém seu contrato atual de pacote consolidado.

## Verificação

Com Node 24, execute `node --test tests/fretebarato.test.mjs`. Os testes cobrem conversões, validação, isolamento entre lojas, erros do fornecedor, proteção do token e limite de integrações. Execute também `npm run build`.

Os testes usam respostas simuladas. A homologação real depende das credenciais da conta e da publicação das duas funções. Compare preço e prazo com a conta Frete Barato antes de ativar para clientes.

## Documentação oficial

- [Cotação](https://docs.fretebarato.com/pt/recursos/cotacoes)
- [Autenticação e identificação da plataforma](https://docs.fretebarato.com/pt/primeiros-passos/autenticacao)
