# Teste de carga do Cartzy — 21/11/2026

Execução externa pelo GitHub Actions, aproximadamente 23h39–23h44 (São Paulo). [Execução e artefatos](https://github.com/rmalves29/live-launchpad-79/actions/runs/44977067505).

## Resultado

- Vitrine da live: último nível dentro da meta foi **512 requisições concorrentes**, p95 de **1.626 ms**, sem erros nessa etapa. Com **1.024**, p95 chegou a **4.205 ms** e o circuito interrompeu o teste.
- Consulta pública de cadastro: chegou ao teto testado de **1.024 requisições concorrentes**, p95 de **2.780 ms**, sem erros. O limite absoluto dessa consulta não foi encontrado.
- A etapa da vitrine com 256 concorrentes registrou **0,15% de erros**; a etapa seguinte com 512 não registrou erros. O resumo dos logs não classifica a causa desses três erros; os dados completos estão no artefato da execução.
- Com 128 concorrentes, p95 de 444 ms na vitrine e 286 ms na consulta de cadastro.

Esses números são trabalhadores que fazem requisições em paralelo, **não quantidade de clientes conectadas** e não garantia de pedidos por segundo. A faixa de degradação observada da vitrine fica entre os níveis testados de 512 e 1.024; não foi medido um ponto exato entre eles.

## Metodologia e limites

Somente leitura, nas lojas públicas app e lagrandame, alternadas a cada requisição. Vitrine: ação catalog com offset 0 e limite 60 em live-shop. Cadastro: leitura de id, nome, slug, logo e cor em tenants_public. As otimizações e caches de produção estavam ativos. Sem autenticação de clientes, criação de cadastros/pedidos, reserva de estoque, pagamentos, frete ou WhatsApp.

Etapas de 1, 2, 4, 8, 16, 32, 64, 128, 256, 512 e 1.024 concorrentes. Cada etapa durava até 12 segundos **ou até 2.000 requisições**, com pausa de 150 ms por trabalhador após uma resposta e recuperação de 5 segundos entre etapas. Por isso, as etapas altas foram rajadas curtas, não uma medição sustentada de vários minutos. Interrupção com p95 acima de 3 segundos ou erros acima de 2%, respeitados os mínimos de amostras do circuito.

A taxa por segundo foi a média de cada etapa; etapas com durações diferentes, respostas em andamento, caches e erros não devem ser comparadas como uma curva perfeita de capacidade. p95 = tempo abaixo do qual ficaram 95% das respostas daquela etapa. Latência inclui a rede entre o runner do GitHub e a API.

O teste inicial dentro de uma função de diagnóstico foi descartado como medição de capacidade: o gerador teve RateLimitError após cerca de 30 chamadas. Essa função temporária foi fechada e retorna 403. Os números abaixo são exclusivamente da execução externa.

## Etapas medidas

| Requisições concorrentes | Vitrine: req/s | Vitrine: p95 ms | Vitrine: erros | Cadastro: req/s | Cadastro: p95 ms | Cadastro: erros |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 4.31 | 175 | 0.00% | 4.3 | 101 | 0.00% |
| 2 | 8.86 | 175 | 0.00% | 8.55 | 98 | 0.00% |
| 4 | 17.76 | 149 | 0.00% | 17.07 | 97 | 0.00% |
| 8 | 29.87 | 389 | 0.00% | 33.6 | 107 | 0.00% |
| 16 | 68.79 | 152 | 0.00% | 68.1 | 101 | 0.00% |
| 32 | 141.81 | 117 | 0.00% | 137.11 | 95 | 0.00% |
| 64 | 267.19 | 293 | 0.00% | 268.42 | 100 | 0.00% |
| 128 | 476.74 | 444 | 0.00% | 483.69 | 286 | 0.00% |
| 256 | 205.8 | 783 | 0.15% | 603.81 | 695 | 0.00% |
| 512 | 625.07 | 1626 | 0.00% | 499.32 | 1323 | 0.00% |
| 1024 | 420.02 | 4205 | 0.00% | 431.38 | 2780 | 0.00% |

## Repetir

Requer Node.js 24 e acesso de rede. Na raiz do repositório:

```powershell
node scripts/load-test-cartzy.mjs --scenario catalog
node scripts/load-test-cartzy.mjs --scenario registration
```

Os resultados completos são gravados em work/load-tests. Para estimar capacidade de vendas é necessário outro cenário, em ambiente isolado, com carrinhos, pedidos, estoque concorrente e respostas simuladas de pagamento/WhatsApp; estes resultados não certificam esses fluxos.
