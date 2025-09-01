# API do WhatsApp para Etiquetas

## Configuração Necessária

Para que a funcionalidade de etiquetas automáticas "APP" funcione, você precisa implementar o endpoint `/add-label` no seu servidor do WhatsApp.

## Implementação do Endpoint

### Node.js Express (Exemplo)

```javascript
// server-whatsapp.js
const express = require('express');
const app = express();

app.use(express.json());

// Endpoint para adicionar etiquetas
app.post('/add-label', async (req, res) => {
  try {
    const { phone, label } = req.body;
    
    if (!phone || !label) {
      return res.status(400).json({ error: 'Phone and label are required' });
    }

    console.log(`Adding label "${label}" to contact: ${phone}`);
    
    // Aqui você deve implementar a lógica específica da sua API do WhatsApp
    // Exemplos de implementação dependendo da sua solução:
    
    // 1. Para WhatsApp Web.js:
    // const contact = await client.getContactById(phone + '@c.us');
    // await contact.addLabel(label);
    
    // 2. Para Baileys:
    // await sock.chatModify({ addChatLabel: { labelId: 'APP' } }, phone + '@s.whatsapp.net');
    
    // 3. Para APIs comerciais (ex: 360Dialog, Twilio):
    // const response = await fetch('https://api.whatsapp.com/v1/contacts/' + phone + '/labels', {
    //   method: 'POST',
    //   headers: { 'Authorization': 'Bearer YOUR_TOKEN' },
    //   body: JSON.stringify({ labels: [label] })
    // });
    
    // Simulação para teste (remover em produção)
    console.log(`✅ Label "${label}" successfully added to ${phone}`);
    
    res.json({ 
      success: true, 
      message: `Label "${label}" added to contact ${phone}` 
    });
    
  } catch (error) {
    console.error('Error adding label:', error);
    res.status(500).json({ 
      error: 'Failed to add label',
      details: error.message 
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`WhatsApp server running on port ${PORT}`);
});
```

### Python Flask (Exemplo)

```python
from flask import Flask, request, jsonify
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

@app.route('/add-label', methods=['POST'])
def add_label():
    try:
        data = request.get_json()
        phone = data.get('phone')
        label = data.get('label')
        
        if not phone or not label:
            return jsonify({'error': 'Phone and label are required'}), 400
        
        app.logger.info(f'Adding label "{label}" to contact: {phone}')
        
        # Implementar sua lógica de API do WhatsApp aqui
        # Exemplo para diferentes bibliotecas:
        
        # 1. Para yowsup:
        # whatsapp_client.add_contact_label(phone, label)
        
        # 2. Para API comercial:
        # requests.post(f'https://api.whatsapp.com/v1/contacts/{phone}/labels',
        #               headers={'Authorization': 'Bearer YOUR_TOKEN'},
        #               json={'labels': [label]})
        
        # Simulação para teste
        app.logger.info(f'✅ Label "{label}" successfully added to {phone}')
        
        return jsonify({
            'success': True,
            'message': f'Label "{label}" added to contact {phone}'
        })
        
    except Exception as e:
        app.logger.error(f'Error adding label: {str(e)}')
        return jsonify({
            'error': 'Failed to add label',
            'details': str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
```

## Como Funciona

1. **Envio de Mensagem em Massa**: Quando você envia uma mensagem em massa via sistema
2. **Trigger Automático**: O sistema detecta automaticamente mensagens do tipo `broadcast`
3. **Chamada à API**: O sistema chama automaticamente o endpoint `/add-label` do seu servidor WhatsApp
4. **Adição da Etiqueta**: Sua API adiciona a etiqueta "APP" no contato do WhatsApp
5. **Log do Sistema**: O resultado é registrado nos logs para monitoramento

## Portas Testadas

O sistema tenta automaticamente as seguintes portas:
- `http://localhost:8080/add-label`
- `http://localhost:3001/add-label`

## Teste Manual

Você pode testar o endpoint manualmente:

```bash
curl -X POST http://localhost:8080/add-label \
  -H "Content-Type: application/json" \
  -d '{"phone": "5511999999999", "label": "APP"}'
```

## Monitoramento

Os logs de tentativas de adição de etiquetas ficam disponíveis na tabela `whatsapp_messages` com `type: 'system_log'`.

## Troubleshooting

1. **Verifique se o servidor WhatsApp está rodando** na porta correta
2. **Confirme que o endpoint `/add-label` está implementado**
3. **Verifique os logs** na tabela `whatsapp_messages` para ver tentativas
4. **Teste o endpoint manualmente** com curl ou Postman

## Integração com Diferentes APIs

Dependendo da sua solução de WhatsApp, a implementação pode variar:

- **WhatsApp Business API**: Use endpoints oficiais da Meta
- **WhatsApp Web.js**: Use métodos de manipulação de contatos
- **Baileys**: Use funções de modificação de chat
- **APIs Terceirizadas**: Use endpoints específicos do provedor

A etiqueta "APP" será adicionada automaticamente a todos os contatos que receberem mensagens em massa!