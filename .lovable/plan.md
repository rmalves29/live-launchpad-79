## Diagnóstico (FL Semi Joias)

Investiguei a empresa `fernandalimasemijoia` (tenant `b22bb1e6-…`) e os 3 códigos citados:

| Código | Nome | Estoque atual | Última alteração |
|---|---|---|---|
| 51460 | Berloque Árvore da Vida | 1 | 08/05 (criação) — nunca atualizado |
| 51461 | Trava simples | 22 | 08/05 (criação) — nunca atualizado |
| 51496 | Berloque Sanduíche | 3 | 09/05 (manual `stock_changed`) |

Olhando o `audit_logs` dos últimos 7 dias dessa empresa, **toda** alteração recente de estoque é em códigos com prefixo `C` (ex.: `C76399`, `C74891`). Nenhuma das linhas com código puramente numérico (`51460/51461/51496`) aparece. Conclusão: **a planilha importada não continha esses códigos** (ou continha com grafia diferente, ex.: `C51461`, e o sistema não encontrou o produto existente e teria tentado inserir novo — mas não há registro disso, então mais provável é "ausentes da planilha").

### Causas possíveis (em ordem de probabilidade)

1. **Linhas ausentes na planilha** — produtos não listados ficam intactos. A importação só age sobre o que está no arquivo.
2. **Código divergente** — Excel pode comer zero à esquerda, adicionar espaços, ou o usuário pode ter trocado prefixo (`51461` vs `C51461`). Com código diferente, o sistema **insere produto novo** com estoque 0 e o antigo permanece.
3. **Linha pulada por validação** — se `codigo`, `nome` ou `preco` estiverem vazios, a linha é descartada silenciosamente (vai na contagem "pulados", mas usuário pode não ter notado).
4. **Duplicidade** — não é o caso aqui (constraint `UNIQUE(tenant_id, code)` impede).

## Plano

### 1. Correção imediata (SQL para o usuário rodar)

Script para listar e zerar estoque dos produtos que ficaram esquecidos. Será entregue pronto no chat para execução no SQL Editor, parametrizando os códigos que o usuário confirmar.

```sql
-- Listar primeiro
SELECT code, name, stock FROM products
WHERE tenant_id = 'b22bb1e6-e9a1-4469-aa4e-57ab13f29321'
  AND code IN ('51460','51461','51496');

-- Zerar
UPDATE products SET stock = 0, updated_at = now()
WHERE tenant_id = 'b22bb1e6-e9a1-4469-aa4e-57ab13f29321'
  AND code IN ('51460','51461','51496');
```

### 2. Melhorias na importação (`src/pages/produtos/Index.tsx`)

Para evitar que isso volte a acontecer silenciosamente:

- **Forçar código como texto** ao ler o Excel (`raw: false` + tratamento explícito no `XLSX.utils.sheet_to_json`) para preservar zeros à esquerda e evitar `51461.0`.
- **Trim/normalização do `codigo`** antes do match (já é feito no produto, mas garantir no lookup também).
- **Quando o lookup não encontrar**, em vez de inserir silenciosamente um produto novo, distinguir no relatório final entre:
  - `X atualizado(s)`
  - `Y inserido(s) (código novo)`
  - `Z pulado(s) (campos vazios)`
- **Listar os códigos inseridos como novos** no painel de resultados, para o usuário revisar se houve erro de digitação.
- **Opção "modo somente atualização"** (checkbox): quando marcada, códigos não encontrados não são inseridos, e sim listados como aviso. Útil para casos como zerar estoque, evitando criar duplicatas acidentais.

### 3. Validação

- Testar com planilha contendo:
  - Código existente com estoque 0 → atualiza
  - Código com espaço extra → atualiza (após trim)
  - Código com prefixo errado → no modo "somente atualização", lista no aviso ao invés de criar
  - Linha sem `preco` → relatada explicitamente

### O que preciso de você

Para confirmar a causa exata desses 3 produtos: a planilha que você importou continha as linhas `51460`, `51461`, `51496`? Se sim, com qual grafia exata? Se você não tem mais a planilha, posso já aplicar o fix de SQL + as melhorias na importação.
