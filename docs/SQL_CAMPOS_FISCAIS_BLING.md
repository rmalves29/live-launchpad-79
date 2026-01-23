# Campos Fiscais Padrão para Integração Bling

## Objetivo
Adicionar campos para configurar dados fiscais padrão (NCM, CFOP, IPI, ICMS, PIS/COFINS) que serão enviados automaticamente com os pedidos para o Bling ERP.

## Como aplicar

1. Acesse o **Supabase Dashboard** do seu projeto
2. Vá em **SQL Editor**
3. Cole e execute o SQL abaixo:

```sql
-- Adicionar campos fiscais padrão na integração Bling
ALTER TABLE public.integration_bling
ADD COLUMN IF NOT EXISTS store_state TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS default_ncm TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS default_cfop_same_state TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS default_cfop_other_state TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS default_ipi DECIMAL(5,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS default_icms_situacao TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS default_icms_origem TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS default_pis_cofins TEXT DEFAULT NULL;

-- Comentários para documentação
COMMENT ON COLUMN public.integration_bling.store_state IS 'UF da loja para comparação automática de CFOP (ex: SP, MG, RJ)';
COMMENT ON COLUMN public.integration_bling.default_ncm IS 'NCM padrão para produtos (ex: 62052000)';
COMMENT ON COLUMN public.integration_bling.default_cfop_same_state IS 'CFOP para vendas no mesmo estado (ex: 5102)';
COMMENT ON COLUMN public.integration_bling.default_cfop_other_state IS 'CFOP para vendas em outro estado (ex: 6102)';
COMMENT ON COLUMN public.integration_bling.default_ipi IS 'Alíquota padrão de IPI (ex: 0.00)';
COMMENT ON COLUMN public.integration_bling.default_icms_situacao IS 'Situação tributária ICMS (ex: 102, 103, 400)';
COMMENT ON COLUMN public.integration_bling.default_icms_origem IS 'Origem da mercadoria ICMS (0-9)';
COMMENT ON COLUMN public.integration_bling.default_pis_cofins IS 'Situação tributária PIS/COFINS (ex: 07, 08, 49)';
```

## Campos

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `store_state` | TEXT | UF da loja (ex: SP, MG) - usado para calcular CFOP automaticamente |
| `default_ncm` | TEXT | NCM padrão para produtos (8 dígitos) |
| `default_cfop_same_state` | TEXT | CFOP para vendas no mesmo estado (ex: 5102) |
| `default_cfop_other_state` | TEXT | CFOP para vendas em outro estado (ex: 6102) |
| `default_ipi` | DECIMAL(5,2) | Alíquota de IPI em % |
| `default_icms_situacao` | TEXT | Código de situação tributária ICMS |
| `default_icms_origem` | TEXT | Origem da mercadoria (0-9) |
| `default_pis_cofins` | TEXT | Código de situação tributária PIS/COFINS |

## Lógica de CFOP Automático

O sistema compara o `store_state` com o estado do cliente:

- Se `cliente.state == store_state` → usa `default_cfop_same_state` (5xxx)
- Se `cliente.state != store_state` → usa `default_cfop_other_state` (6xxx)

## CFOPs Comuns

| CFOP | Descrição |
|------|-----------|
| 5102 | Venda mercadoria - dentro do estado |
| 6102 | Venda mercadoria - fora do estado |
| 5405 | Venda ICMS ST - dentro do estado |
| 6404 | Venda ICMS ST - fora do estado |

## Situações Tributárias ICMS (Simples Nacional)

| Código | Descrição |
|--------|-----------|
| 102 | Tributada sem permissão de crédito |
| 103 | Isenção do ICMS para faixa de receita bruta |
| 300 | Imune |
| 400 | Não tributada |
| 500 | ICMS cobrado anteriormente por substituição |
| 900 | Outros |

## Origem da Mercadoria

| Código | Descrição |
|--------|-----------|
| 0 | Nacional |
| 1 | Estrangeira - importação direta |
| 2 | Estrangeira - adquirida no mercado interno |
| 3 | Nacional com mais de 40% de conteúdo estrangeiro |
| 4 | Nacional (processos produtivos básicos) |
| 5 | Nacional com menos de 40% de conteúdo estrangeiro |
| 6 | Estrangeira - importação direta, sem similar nacional |
| 7 | Estrangeira - adquirida no mercado interno, sem similar nacional |
| 8 | Nacional, mercadoria ou bem com Conteúdo de Importação > 70% |

## Situações Tributárias PIS/COFINS

| Código | Descrição |
|--------|-----------|
| 01 | Operação Tributável - Base de Cálculo = Valor da Operação |
| 04 | Operação Tributável Monofásica - Revenda à Alíquota Zero |
| 06 | Operação Tributável à Alíquota Zero |
| 07 | Operação Isenta da Contribuição |
| 08 | Operação sem Incidência da Contribuição |
| 49 | Outras Operações de Saída |
| 99 | Outras Operações |
