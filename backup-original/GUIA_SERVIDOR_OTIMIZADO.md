# 🚀 Guia Completo - Servidor WhatsApp Otimizado

## ✅ Funcionalidades Implementadas

### 🔄 Processamento Automático
- **Detecção de códigos**: Automaticamente detecta C###, P###, A### 
- **Busca de produtos**: Consulta direta no Supabase
- **Resposta automática**: Envia detalhes do produto formatados
- **Tag automática**: Adiciona "APP" aos clientes que enviaram códigos
- **Integração completa**: Conecta com carrinho via Edge Functions

### 📱 Múltiplas Instâncias WhatsApp
- **6 instâncias simultâneas**: instancia1 até instancia6
- **Round-robin**: Distribui mensagens automaticamente
- **Auto-reconexão**: Reconecta instâncias que caem
- **Status em tempo real**: Monitor via API

### 🛡️ Sistema Anti-Duplicação
- **Cache inteligente**: Evita mensagens duplicadas por 10min
- **Hash único**: Baseado em número + conteúdo
- **Limpeza automática**: Remove entradas antigas

### 🔄 Sistema de Retry Avançado
- **3 tentativas automáticas**: Para mensagens falhadas
- **Intervalo configurável**: Entre tentativas
- **Log completo**: Rastreamento de todas as tentativas

## 🔧 Instalação Rápida

### 1. Dependências
```bash
npm install whatsapp-web.js express express-fileupload cors qrcode-terminal
```

### 2. Executar
```bash
node server-whatsapp-otimizado.js
```

### 3. Configurar WhatsApp
- Escaneie **todos os 6 QR codes** que aparecerão
- Aguarde status "online" em todas as instâncias
- Verifique: `curl http://localhost:3333/api/status`

## 🌐 Configuração no Frontend

```javascript
// No console do navegador ou localStorage
localStorage.setItem('whatsapp_api_url', 'http://localhost:3333');
```

## 📋 Endpoints da API

### 📤 Envio em Massa (Novo formato otimizado)
```bash
POST http://localhost:3333/api/send-config
Content-Type: application/json

{
  "data": "{
    \"numeros\": [\"5531999999999\", \"5531888888888\"],
    \"mensagens\": [\"Sua mensagem personalizada\"],
    \"interval\": 2000,
    \"batchSize\": 5,
    \"batchDelay\": 3000
  }"
}
```

### 📤 Envio Individual
```bash
POST http://localhost:3333/send-message
{
  "number": "5531999999999", 
  "message": "Mensagem individual"
}
```

### 📊 Status e Monitoramento
```bash
# Status das instâncias
GET http://localhost:3333/api/status

# Logs do sistema  
GET http://localhost:3333/api/logs

# Mensagens recebidas
GET http://localhost:3333/api/client-responses

# Status de envios
GET http://localhost:3333/api/message-status

# Estatísticas do retry
GET http://localhost:3333/api/retry-stats
```

## 🤖 Como Funciona o Processamento Automático

### 1. Cliente envia código
```
Cliente: "C111"
```

### 2. Sistema detecta padrão
- Regex: `/^([CPA]\d{2,4})\s*$/i`
- Códigos válidos: C111, P999, A123, etc.

### 3. Busca no Supabase
```sql
SELECT id,name,price,stock,code,image_url 
FROM products 
WHERE code = 'C111'
```

### 4. Resposta automática
```
🛒 *Item Adicionado ao Carrinho*

Olá [Nome]! 

✅ Produto: *Calça Jeans*
📦 Quantidade: *1*
💰 Preço: *R$ 79,90*
🏷️ Código: *C111*
📦 Estoque: 15 unidades

Seu item foi adicionado com sucesso ao carrinho! 🎉

💬 Continue enviando códigos de produtos ou entre em contato para finalizar seu pedido.

Obrigado pela preferência! 🙌
```

### 5. Ações automáticas
- ✅ Adiciona tag "APP" no WhatsApp
- ✅ Cria/atualiza carrinho no Supabase
- ✅ Registra no histórico de mensagens
- ✅ Log detalhado da operação

## 🔍 Monitoramento e Logs

### Tipos de eventos registrados:
- `codigo_detectado`: Código válido encontrado
- `produto_processado`: Produto encontrado e processado
- `produto_nao_encontrado`: Código inexistente
- `label_adicionada`: Tag adicionada ao cliente
- `envio_finalizado`: Lote de mensagens concluído

### Log exemplo:
```json
{
  "data": "2025-01-09T14:30:00.000Z",
  "evento": "produto_processado", 
  "codigo": "C111",
  "produto": "Calça Jeans",
  "cliente": "João Silva",
  "numero": "5531999999999"
}
```

## ⚠️ Troubleshooting

### QR Code não aparece
```bash
# Verificar se Chrome está instalado
whereis google-chrome
# ou 
whereis msedge

# Executar como administrador se necessário
sudo node server-whatsapp-otimizado.js
```

### Instância fica offline
1. Verificar conexão internet
2. Reconectar WhatsApp Web manualmente  
3. Reiniciar servidor se necessário

### Códigos não funcionam
1. **Verificar formato**: Deve ser exato (C111, P999, A123)
2. **Produto existe?**: Confirmar no Supabase
3. **Credenciais OK?**: Verificar tokens da API
4. **Ver logs**: `GET /api/logs` para detalhes

### Mensagens não enviam
1. **Status das instâncias**: Pelo menos 1 deve estar "online"
2. **Formato do número**: 5531999999999 (sem espaços/símbolos)
3. **Ver retry stats**: `GET /api/retry-stats`

## 🔄 Sistema de Warmup (Opcional)

```bash
# Iniciar warmup entre instâncias
POST http://localhost:3333/api/warmup/start
{
  "interval1": 300000,
  "interval2": 120000,  
  "messages": ["👋", "Oi", "Olá"]
}

# Parar warmup
POST http://localhost:3333/api/warmup/stop

# Status do warmup
GET http://localhost:3333/api/warmup/status
```

## 📱 Integração com Grupos (Bonus)

```bash
# Listar grupos disponíveis
GET http://localhost:3333/api/groups

# Adicionar contatos a grupo
POST http://localhost:3333/api/group/add
{
  "numeros": ["5531999999999"],
  "groupId": "120363000000000000@g.us"
}
```

## 🚨 Importante - Checklist

- [ ] Node.js 18+ instalado
- [ ] Todas as 6 instâncias conectadas 
- [ ] Frontend configurado com URL correta
- [ ] Produtos cadastrados no Supabase
- [ ] Tokens do Supabase configurados
- [ ] Servidor rodando continuamente
- [ ] Backup da pasta `.wwebjs_auth`

## 📞 Teste Rápido

1. **Enviar código via WhatsApp**: "C111" 
2. **Verificar resposta automática**: Deve chegar em segundos
3. **Conferir logs**: `curl http://localhost:3333/api/logs`
4. **Verificar no app**: Produto deve aparecer no carrinho

🎉 **Sistema funcionando perfeitamente quando todos os passos acima estão OK!**