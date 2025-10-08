# 📱 Como Usar o WhatsApp Simples

## 🚀 Iniciar

```powershell
# 1. Instalar dependências (primeira vez)
npm install whatsapp-web.js qrcode-terminal express

# 2. Iniciar servidor
node whatsapp-simples.js
```

## 📱 Conectar WhatsApp

1. Aguarde o QR Code aparecer no terminal
2. Abra WhatsApp no celular
3. Vá em **Aparelhos conectados**
4. Clique em **Conectar um aparelho**
5. Escaneie o QR Code
6. Aguarde a mensagem "✅ WhatsApp conectado com sucesso!"

## 📤 Enviar Mensagens

### Via cURL (Terminal)

#### Enviar uma mensagem:
```bash
curl -X POST http://localhost:3000/enviar \
  -H "Content-Type: application/json" \
  -d "{\"telefone\": \"11999999999\", \"mensagem\": \"Olá, teste!\"}"
```

#### Enviar para vários números:
```bash
curl -X POST http://localhost:3000/enviar-massa \
  -H "Content-Type: application/json" \
  -d "{\"telefones\": [\"11999999999\", \"11888888888\"], \"mensagem\": \"Olá a todos!\"}"
```

### Via PowerShell

```powershell
# Enviar uma mensagem
$body = @{
    telefone = "11999999999"
    mensagem = "Olá, teste!"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/enviar" -Method POST -Body $body -ContentType "application/json"

# Enviar para vários
$body = @{
    telefones = @("11999999999", "11888888888")
    mensagem = "Olá a todos!"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/enviar-massa" -Method POST -Body $body -ContentType "application/json"
```

### Via JavaScript/Fetch

```javascript
// Enviar uma mensagem
fetch('http://localhost:3000/enviar', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    telefone: '11999999999',
    mensagem: 'Olá, teste!'
  })
})
.then(res => res.json())
.then(data => console.log(data));

// Enviar para vários
fetch('http://localhost:3000/enviar-massa', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    telefones: ['11999999999', '11888888888'],
    mensagem: 'Olá a todos!'
  })
})
.then(res => res.json())
.then(data => console.log(data));
```

## 📊 Verificar Status

```bash
# Via cURL
curl http://localhost:3000/status

# Via PowerShell
Invoke-RestMethod -Uri "http://localhost:3000/status"

# Via Navegador
http://localhost:3000/status
```

## 🔧 Endpoints Disponíveis

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/status` | Verifica status da conexão |
| GET | `/health` | Health check do servidor |
| POST | `/enviar` | Envia mensagem para um número |
| POST | `/enviar-massa` | Envia mensagem para vários números |

## 📝 Formato dos Dados

### POST /enviar
```json
{
  "telefone": "11999999999",
  "mensagem": "Sua mensagem aqui"
}
```

### POST /enviar-massa
```json
{
  "telefones": ["11999999999", "11888888888", "11777777777"],
  "mensagem": "Mensagem para todos"
}
```

## ✅ Respostas

### Sucesso (enviar):
```json
{
  "success": true,
  "message": "Mensagem enviada com sucesso",
  "telefone": "11999999999",
  "numeroWhatsApp": "5511999999999@c.us"
}
```

### Sucesso (enviar-massa):
```json
{
  "success": true,
  "total": 3,
  "enviados": 2,
  "erros": 1,
  "resultados": [
    { "telefone": "11999999999", "status": "enviado" },
    { "telefone": "11888888888", "status": "enviado" },
    { "telefone": "11777777777", "status": "erro", "erro": "Número inválido" }
  ]
}
```

### Erro:
```json
{
  "success": false,
  "error": "WhatsApp não está conectado",
  "status": "desconectado"
}
```

## 🛑 Parar o Servidor

```powershell
# No terminal onde o servidor está rodando
Ctrl + C
```

## ⚠️ Importante

- O número pode ser enviado com ou sem DDI (55)
- O número pode ser enviado com ou sem DDD
- O servidor adiciona automaticamente o 9º dígito se necessário
- Aguarde 2 segundos entre cada mensagem em massa para evitar bloqueio
- Mantenha o Chrome aberto enquanto o servidor estiver rodando
- A sessão fica salva, não precisa escanear o QR toda vez

## 🔄 Se der erro

```powershell
# 1. Parar tudo
Ctrl + C
taskkill /F /IM node.exe
taskkill /F /IM chrome.exe

# 2. Limpar sessão
Remove-Item -Recurse -Force .wwebjs_auth

# 3. Reiniciar
node whatsapp-simples.js
```
