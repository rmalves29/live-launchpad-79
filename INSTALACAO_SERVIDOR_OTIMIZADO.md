# 📱 Servidor WhatsApp Otimizado - Guia Completo

## 🚀 Funcionalidades Implementadas

### ✅ **Processamento Automático de Códigos**
- **Detecção inteligente**: C111, P999, A123, etc.
- **Busca no Supabase**: Produtos em tempo real
- **Resposta automática**: Mensagem formatada com detalhes
- **Tag "APP"**: Adicionada automaticamente aos clientes
- **Integração carrinho**: Via Edge Functions do Supabase

### 🔄 **Múltiplas Instâncias WhatsApp**
- **6 instâncias simultâneas** (instancia1 a instancia6)
- **Sistema round-robin** para distribuição de envios
- **Anti-duplicata inteligente** (10 minutos de proteção)
- **Sistema de retry automático** para mensagens falhadas
- **Controle de pausa/retomada** de envios

## 📋 Pré-requisitos

1. **Node.js 18+** instalado
2. **WhatsApp Web** funcionando no navegador
3. **Pacotes necessários**:
   ```bash
   npm install whatsapp-web.js express express-fileupload cors qrcode-terminal
   ```

## 🔧 Instalação

### 1. Substituir Servidor Atual

1. **Parar** o servidor atual (Ctrl+C)
2. **Backup** do servidor antigo:
   ```bash
   mv server-whatsapp-minimo.js server-whatsapp-minimo-backup.js
   ```
3. **Executar** o servidor otimizado:
   ```bash
   node server-whatsapp-otimizado.js
   ```

### 2. Configurar Instâncias

O servidor iniciará automaticamente **6 instâncias** do WhatsApp:

1. **Escaneie os QR codes** que aparecerão no terminal
2. **Conecte cada instância** com um número diferente do WhatsApp
3. **Aguarde** todas as instâncias ficarem "online"

## 🤖 Processamento Automático de Códigos

### Como Funciona

1. **Cliente envia código**: "C111"
2. **Sistema detecta padrão**: Regex `/^([CPA]\d{2,4})\s*$/i`
3. **Busca produto no Supabase**: Automaticamente
4. **Envia resposta formatada**: Com detalhes do produto
5. **Adiciona tag "APP"**: No WhatsApp Business
6. **Atualiza carrinho**: Via Edge Function

### Exemplo de Resposta Automática

```
🛒 *Item Adicionado ao Carrinho*

Olá João Silva! 

✅ Produto: *Calça Jeans*
📦 Quantidade: *1*
💰 Preço: *R$ 79,90*
🏷️ Código: *C111*
📦 Estoque: 15 unidades

Seu item foi adicionado com sucesso ao carrinho! 🎉

💬 Continue enviando códigos de produtos ou entre em contato para finalizar seu pedido.

Obrigado pela preferência! 🙌
```

## 🌐 Nova API - Porta 3333

### 📊 Endpoints Principais

#### Status das Instâncias
```bash
GET http://localhost:3333/api/status
```

#### Envio em Massa Otimizado
```bash
POST http://localhost:3333/api/send-config
Content-Type: application/json

{
  "data": "{\"numeros\":[\"5531999999999\"],\"mensagens\":[\"Sua mensagem\"],\"interval\":2000,\"batchSize\":5,\"batchDelay\":3000}"
}
```

#### Envio Individual (Compatibilidade)
```bash
POST http://localhost:3333/send-message
{
  "number": "5531999999999",
  "message": "Sua mensagem"
}
```

#### Adicionar Etiqueta
```bash
POST http://localhost:3333/add-label
{
  "phone": "5531999999999",
  "label": "app"
}
```

#### Mensagens Recebidas (Novo)
```bash
GET http://localhost:3333/api/client-responses
```

## 🔍 Monitoramento e Logs

### Logs em Tempo Real
```bash
GET http://localhost:3333/api/logs
```

### Tipos de Eventos
- `codigo_detectado`: Código válido detectado
- `produto_processado`: Produto encontrado e processado
- `produto_nao_encontrado`: Código não existe no catálogo
- `label_adicionada`: Tag adicionada ao cliente
- `envio_finalizado`: Lote de mensagens concluído

### Exemplo de Log
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

## 🚦 Controle de Envios

### Pausar/Retomar Envios
```bash
POST http://localhost:3333/api/pause-sending    # Pausar
POST http://localhost:3333/api/resume-sending   # Retomar
GET http://localhost:3333/api/sending-status    # Status
```

## 🛠️ Solução de Problemas

### ❌ Códigos não são processados
1. **Formato correto**: C111, P999, A123 (sem espaços extras)
2. **Produto existe**: Verificar no Supabase
3. **Credenciais**: Confirmar tokens do Supabase
4. **Ver logs**: `GET /api/logs` para detalhes

### ❌ "Nenhuma instância disponível"
- Verifique se pelo menos 1 instância está "online"
- Escaneie novamente os QR codes se necessário
- Aguarde a reconexão automática

### ❌ Instância desconectada
- O sistema tentará reconectar automaticamente
- Monitore os logs para acompanhar
- Reconecte manualmente se necessário

## 📱 Configuração no Frontend

Configure a URL do servidor no localStorage:

```javascript
localStorage.setItem('whatsapp_api_url', 'http://localhost:3333');
```

## ⚙️ Configurações do Sistema

### Configurações de Envio
- **Intervalo entre mensagens**: 2000ms (2 segundos)
- **Tamanho do lote**: 5 mensagens
- **Pausa entre lotes**: 3000ms (3 segundos)
- **Máximo processos simultâneos**: 1

### Sistema Anti-Duplicata
- **Proteção**: 10 minutos
- **Baseado em**: Número + hash da mensagem
- **Limpeza automática**: A cada 4000 mensagens

## 🎯 Teste Rápido do Sistema

1. **Conectar instâncias**: Escanear todos os QR codes
2. **Verificar status**: `curl http://localhost:3333/api/status`
3. **Testar código**: Enviar "C111" via WhatsApp
4. **Verificar logs**: `curl http://localhost:3333/api/logs`
5. **Confirmar carrinho**: Verificar no app se produto foi adicionado

## 📈 Benefícios da Nova Versão

- **6x mais capacidade** de envio
- **Processamento automático** de códigos de produtos
- **Maior confiabilidade** com múltiplas instâncias
- **Tags automáticas** para organização
- **Integração completa** com Supabase
- **Monitoramento em tempo real**

---

**🔄 Para voltar ao servidor antigo**: Renomeie `server-whatsapp-minimo-backup.js` para `server-whatsapp-minimo.js` e execute com `node server-whatsapp-minimo.js`

## 🌐 Nova API - Porta 3333

O servidor agora roda na **porta 3333** (antes era 3000).

### 📊 Endpoints Principais

#### Status das Instâncias
```
GET http://localhost:3333/api/status
```

#### Envio em Massa Otimizado
```
POST http://localhost:3333/api/send-config
Content-Type: application/json

{
  "data": "{\"numeros\":[\"5531999999999\"],\"mensagens\":[\"Sua mensagem\"],\"interval\":2000,\"batchSize\":5,\"batchDelay\":3000}"
}
```

#### Compatibilidade (Envio Individual)
```
POST http://localhost:3333/send-message
Content-Type: application/json

{
  "number": "5531999999999",
  "message": "Sua mensagem"
}
```

#### Adicionar Etiqueta
```
POST http://localhost:3333/add-label
Content-Type: application/json

{
  "phone": "5531999999999",
  "label": "app"
}
```

## ⚙️ Configurações do Sistema

### Configurações de Envio
- **Intervalo entre mensagens**: 2000ms (2 segundos)
- **Tamanho do lote**: 5 mensagens
- **Pausa entre lotes**: 3000ms (3 segundos)
- **Máximo processos simultâneos**: 1

### Sistema Anti-Duplicata
- **Proteção**: 10 minutos
- **Baseado em**: Número + hash da mensagem
- **Limpeza automática**: A cada 4000 mensagens

## 🎯 Funcionalidades Automáticas

### 1. **Tag "APP" Automática**
- Adicionada automaticamente a todos os clientes que recebem mensagens
- Funciona para envios individuais e em massa
- Permite organização no WhatsApp Business

### 2. **Sistema de Retry**
- **3 tentativas** por mensagem falhada
- **Intervalo**: 30 segundos entre tentativas
- **Limpeza**: Remove mensagens antigas (5 minutos)

### 3. **Round-Robin Inteligente**
- Distribui mensagens entre instâncias disponíveis
- Pula instâncias offline automaticamente
- Balanceamento de carga automático

## 🔍 Monitoramento

### Logs em Tempo Real
```
GET http://localhost:3333/api/logs
```

### Status das Mensagens
```
GET http://localhost:3333/api/message-status
```

### Estatísticas de Retry
```
GET http://localhost:3333/api/retry-stats
```

### Respostas dos Clientes
```
GET http://localhost:3333/api/client-responses
```

## 🚦 Controle de Envios

### Pausar Envios
```
POST http://localhost:3333/api/pause-sending
```

### Retomar Envios
```
POST http://localhost:3333/api/resume-sending
```

### Status dos Envios
```
GET http://localhost:3333/api/sending-status
```

## 🛠️ Solução de Problemas

### ❌ "Nenhuma instância disponível"
- Verifique se pelo menos 1 instância está "online"
- Escaneie novamente os QR codes se necessário
- Aguarde a reconexão automática

### ❌ "Máximo de processos simultâneos"
- Aguarde o envio atual terminar
- Ou aumente `maxConcurrent` no código

### ❌ Instância desconectada
- O sistema tentará reconectar automaticamente
- Monitore os logs para acompanhar

## 📱 Integração com o Sistema

O sistema frontend foi atualizado automaticamente para:

1. **Usar a porta 3333** como padrão
2. **Envio em massa otimizado** na página de templates
3. **Tags automáticas** para todos os envios
4. **Retry inteligente** para mensagens falhadas

## 🔧 Configuração Avançada

### Personalizar Instâncias
Edite a linha no código:
```javascript
const INSTANCES = ['instancia1','instancia2','instancia3','instancia4','instancia5','instancia6'];
```

### Ajustar Timings
```javascript
const SEND_RULES = { 
  interval: 2000,     // ms entre mensagens
  batchSize: 5,       // mensagens por lote
  batchDelay: 3000,   // ms entre lotes
  maxConcurrent: 1    // processos simultâneos
};
```

## 📈 Benefícios da Nova Versão

- **6x mais capacidade** de envio
- **Maior confiabilidade** com múltiplas instâncias
- **Envios mais rápidos** com sistema otimizado
- **Menos bloqueios** pelo WhatsApp
- **Organização automática** com tags
- **Monitoramento completo** em tempo real

---

**🔄 Para voltar ao servidor antigo**: Renomeie `server-whatsapp-minimo-backup.js` para `server-whatsapp-minimo.js` e execute com `node server-whatsapp-minimo.js`