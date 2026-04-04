

# Plano: Redesenhar etiqueta no modelo oficial dos Correios

## Contexto
A etiqueta atual (`CorreiosLabelPrint.tsx`) tem um layout simplificado. O usuário quer que siga o modelo oficial dos Correios (conforme a imagem enviada), com:
- Logo dos Correios no canto superior direito
- Tipo de serviço (EXPRESSA/PAC) ao lado do logo
- Contrato e Volume no cabeçalho
- Código de rastreio em destaque com código de barras
- Linha de "Recebedor" e "Assinatura/Documento"
- Bloco DESTINATÁRIO com fundo preto no título e logo Correios
- CEP em destaque + Cidade/UF
- Bloco Remetente na parte inferior
- Código de barras do CEP de destino (Postnet) na parte inferior

## Alterações

### 1. Redesenhar `src/components/integrations/CorreiosLabelPrint.tsx`
Reescrever o componente `SingleLabel` para replicar o layout oficial:

- **Cabeçalho**: código de barras do rastreio (Code128) + tipo de serviço (EXPRESSA/PAC/SEDEX) + "Contrato: {cartaoPostagem}" + "Volume: 1/1"
- **Código de rastreio**: texto grande formatado (ex: "AD 295 137 639 BR")
- **Linha de recebimento**: campos "Recebedor:___" e "Assinatura:___ Documento:___"
- **Bloco Destinatário**: título com fundo preto + texto branco + logo Correios, dados do destinatário, CEP em destaque + Cidade/UF
- **Código de barras do CEP**: barcode Code128 do CEP de destino na parte inferior do bloco
- **Bloco Remetente**: compacto na base da etiqueta

### 2. Adicionar campo `contrato` ao `LabelData`
Incluir o número do contrato/cartão de postagem para exibir no cabeçalho da etiqueta.

### 3. Passar contrato do `CorreiosCWSLabels` para o `CorreiosLabelPrint`
Ao montar os dados de impressão, incluir o cartão de postagem nos dados da etiqueta.

### Detalhes técnicos
- Tamanho mantido em 100mm x 150mm (padrão A6 térmico)
- Dois `Barcode` por etiqueta: um para o tracking code (topo) e um para o CEP destino (inferior)
- CSS de impressão (`@page`) permanece igual
- Nenhuma alteração na Edge Function — apenas visual no frontend

