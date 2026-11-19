# Testes do Cartzy

Rede de proteção dos fluxos críticos. Fica separada do app: nada desta pasta entra no build do Lovable.

```bash
cd tests
npm install   # só na primeira vez (instala o Postgres em memória usado nos testes de SQL)
npm test      # roda tudo (~40 s)
```

Precisa de Node 22.18 ou mais novo.

| Arquivo | O que protege |
|---|---|
| `pagamento-gateway.test.mjs` | Cada loja só cobra pelo próprio gateway; erro "Não há sistema de pagamento cadastrado."; desconto do Pix calculado no servidor; trava Pix/cartão |
| `checkout-cupom.test.mjs` | Desconto do cupom igual na tela e no servidor (5.000 casos sorteados) |
| `item-adicionado-pausa.test.mjs` | Pausa anti-bloqueio de 30 min, rodando as funções SQL num Postgres de verdade |
| `item-adicionado-envio.test.mjs` | A função `zapi-send-item-added` respeita a pausa antes de mandar WhatsApp |
| `bling-atendido.test.mjs` | Pedido no Bling: baixa de estoque, "Atendido" e quando o "pedido enviado" pode sair |
| `estoque-erp.test.mjs` | Estoque do ERP chegando no Cartzy, descontando o que já está reservado |
| `fretebarato*`, `olist*` | Testes que já existiam |

Como funciona (`support/`):

- `edge.mjs` roda uma edge function do Supabase dentro do Node, com banco falso (`fake-supabase.mjs`) e todas as
  chamadas externas gravadas; nenhuma mensagem, cobrança ou pedido real sai daqui.
- `pg.mjs` sobe um Postgres em memória e aplica a migração que está sendo testada.
- `extract.mjs` lê funções internas de um arquivo sem alterá-lo (para regras que ainda não são exportadas).

Testes marcados como `todo` mostram um problema já conhecido (ver `docs/refatoracao/decisoes.md`); eles não quebram a
suíte e passam a valer quando a correção for feita.

Mapa de dependências: `node tests/tools/mapa-dependencias.mjs` gera `docs/refatoracao/mapa-dependencias.md`.
