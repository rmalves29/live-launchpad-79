

## Plano: Importar clientes do XLSX para Roanne Jóias (regras atualizadas)

### Resumo

Importar registros do arquivo `Tabela_clientes_VNL.xlsx` para o tenant **Roanne Jóias** (`014457e5-e85f-4d62-874b-6bd0b72213bc`), com as seguintes regras:

### Regras de importação

1. **Cliente COM telefone** → importa normalmente
2. **Cliente SEM telefone + COM Instagram** → **NÃO importa**
3. **Cliente SEM telefone + SEM Instagram** → **NÃO importa**
4. **Duplicatas por telefone** → manter o registro com `Created Date` mais recente
5. **Sem nome** → usar Instagram como nome, ou "Sem nome" como fallback

### Tratamentos

- Telefone: normalizar (remover parênteses, traços, espaços, código 55)
- CPF/CEP: limpar formatação
- Instagram: remover `@`
- Endereço: montar JSON com rua, número, bairro, complemento, CEP, cidade, estado

### Resultado esperado

Apenas clientes com telefone preenchido serão importados. Os demais serão descartados.

### Mudanças no banco

**Nenhuma migração necessária** — o campo `phone` continua NOT NULL, pois só importaremos clientes com telefone.

### Execução

- Script Python com `pandas` para ler XLSX, limpar, filtrar e deduplicar
- Inserção via `psql` com `COPY`

