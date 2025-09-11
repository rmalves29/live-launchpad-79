# Tutorial Completo - Sistema WhatsApp Multitenant

## 🚀 Pré-requisitos

1. **Node.js** versão 18 ou superior
   - Baixe em: https://nodejs.org/
   - Verifique a instalação: `node --version`

2. **WhatsApp Web funcionando**
   - Acesse https://web.whatsapp.com/ no navegador
   - Certifique-se que funciona normalmente

## 📋 Passo 1: Preparação do Ambiente

### 1.1 Abrir Terminal/Prompt de Comando
- **Windows**: Pressione `Win + R`, digite `cmd` e pressione Enter
- **Mac/Linux**: Pressione `Ctrl + Alt + T`

### 1.2 Navegar até a pasta do projeto
```bash
cd caminho/para/seu/projeto
```

### 1.3 Instalar dependências
```bash
npm install
```

## ⚙️ Passo 2: Configurar o Servidor WhatsApp

### 2.1 Copiar as chaves do Supabase

No projeto, você já tem essas informações:
- **SUPABASE_URL**: `https://hxtbsieodbtzgcvvkeqx.supabase.co`
- **SUPABASE_SERVICE_KEY**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA`

### 2.2 Iniciar o servidor WhatsApp

**Para Windows (PowerShell):**
```powershell
$env:SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA"; $env:PORT="3333"; node server-whatsapp-multitenant.js
```

**Para Windows (CMD):**
```cmd
set SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA && set PORT=3333 && node server-whatsapp-multitenant.js
```

**Para Mac/Linux:**
```bash
export SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA" && export PORT="3333" && node server-whatsapp-multitenant.js
```

## 📱 Passo 3: Conectar o WhatsApp

### 3.1 Aguardar o QR Code
Após executar o comando acima, você verá:
```
=== SERVIDOR WHATSAPP MULTITENANT ===
Servidor rodando na porta 3333
JWT role: service_role ✓
Aguardando conexão WhatsApp...
```

### 3.2 Escanear o QR Code
1. Um QR Code aparecerá no terminal
2. Abra o WhatsApp no seu celular
3. Vá em **Configurações** > **Aparelhos conectados**
4. Toque em **Conectar um aparelho**
5. Escaneie o QR Code que apareceu no terminal

### 3.3 Aguardar conexão
Quando conectar com sucesso, você verá:
```
WhatsApp conectado com sucesso!
Cliente pronto para uso!
```

## 🧪 Passo 4: Testar o Sistema

### 4.1 Verificar status do servidor
Abra seu navegador e acesse:
```
http://localhost:3333/api/status
```

Você deve ver algo como:
```json
{
  "status": "online",
  "server": "WhatsApp Multitenant Server",
  "version": "1.0.0",
  "whatsapp_ready": true,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 4.2 Testar envio de mensagem
Para testar o envio de mensagens, você pode usar um programa como Postman ou fazer um teste via código:

**Método 1: Via navegador (teste simples)**
Acesse no navegador:
```
http://localhost:3333/test-send?phone=5511999999999&message=Teste%20de%20mensagem
```
*(Substitua o número pelo seu próprio número com código do país)*

**Método 2: Via código JavaScript (Console do navegador)**
```javascript
fetch('http://localhost:3333/api/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    phone: '5511999999999', // Seu número com código do país
    message: 'Teste de mensagem do sistema!',
    tenant_id: 'seu-tenant-id' // Opcional para teste
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

## 🔧 Passo 5: Configuração Avançada (Opcional)

### 5.1 Para usar com múltiplos tenants
Se você quiser configurar para múltiplos clientes/empresas, precisará:

1. **Criar um tenant no banco de dados**
2. **Configurar as variáveis específicas do tenant**
3. **Usar o endpoint correto para cada tenant**

### 5.2 Configurar para produção
Para usar em produção:

1. **Usar PM2 para manter o servidor rodando:**
```bash
npm install -g pm2
pm2 start server-whatsapp-multitenant.js --name whatsapp-server
```

2. **Configurar firewall se necessário**
3. **Usar HTTPS em produção**

## 🚨 Resolução de Problemas

### Problema 1: "SUPABASE_SERVICE_KEY não definida"
**Solução**: Verifique se executou o comando completo com a chave

### Problema 2: QR Code não aparece
**Solução**: 
- Verifique se o Node.js está instalado
- Certifique-se que executou `npm install`
- Tente fechar e abrir o terminal novamente

### Problema 3: "Erro ao conectar com Supabase"
**Solução**: 
- Verifique sua conexão com internet
- Confirme se a chave SUPABASE_SERVICE_KEY está correta

### Problema 4: WhatsApp desconecta
**Solução**:
- Não feche o WhatsApp Web no navegador
- Mantenha o celular conectado à internet
- Reinicie o servidor se necessário

### Problema 5: Mensagens não são enviadas
**Solução**:
- Verifique se o WhatsApp está conectado (`/api/status`)
- Confirme se o número está no formato correto (com código do país)
- Verifique os logs no terminal

## 📞 Suporte

Se ainda tiver problemas:

1. **Verifique os logs** no terminal onde o servidor está rodando
2. **Teste o status** em `http://localhost:3333/api/status`
3. **Reinicie o servidor** se necessário
4. **Verifique a conexão** do WhatsApp Web

## ✅ Verificação Final

Para confirmar que tudo está funcionando:

1. ✅ Servidor rodando na porta 3333
2. ✅ QR Code escaneado com sucesso
3. ✅ Status mostra "whatsapp_ready": true
4. ✅ Mensagem de teste enviada e recebida

**Pronto! Seu sistema WhatsApp multitenant está funcionando!** 🎉

---

## 📚 Próximos Passos

Agora que o sistema está funcionando, você pode:
- Integrar com seu sistema de vendas
- Configurar templates de mensagens
- Adicionar múltiplos tenants
- Configurar webhooks para automações
- Implementar relatórios e métricas