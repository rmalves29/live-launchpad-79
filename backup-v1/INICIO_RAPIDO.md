# ⚡ INÍCIO RÁPIDO - WhatsApp em 5 Minutos

## 🎯 Sim, você precisa rodar o Node.js!

**Por quê?** Porque o WhatsApp Web não pode rodar direto no navegador. Você precisa de um servidor intermediário.

## 📦 O Que Baixar do Lovable

Baixe estes arquivos do seu projeto Lovable:

```
✅ server-whatsapp-v3.js
✅ package-servidor-whatsapp.json
✅ .env.exemplo
✅ instalar-servidor.bat (Windows)
✅ instalar-servidor.sh (Linux/Mac)
✅ start-windows.bat (Windows)
✅ start-v3.sh (Linux/Mac)
```

**Como baixar:**
1. Clique em "Dev Mode" no Lovable
2. Encontre cada arquivo na lista
3. Copie o conteúdo
4. Cole em arquivos locais no seu computador

## 🚀 Instalação em 3 Passos

### Passo 1: Instalar Node.js

**Ainda não tem?**
- Acesse: https://nodejs.org/
- Baixe a versão **LTS** (botão verde)
- Instale (Next, Next, Finish)
- Reinicie o computador

**Verificar se instalou:**
```bash
node --version
```
Deve mostrar algo como: `v20.11.0`

### Passo 2: Rodar o Instalador

**Windows:**
```bash
instalar-servidor.bat
```

**Linux/Mac:**
```bash
chmod +x instalar-servidor.sh
./instalar-servidor.sh
```

Aguarde a instalação (2-5 minutos).

### Passo 3: Configurar Credenciais

Abra o arquivo `.env` que foi criado e edite:

```env
PORT=3333
SUPABASE_URL=https://hxtbsieodbtzgcvvkeqx.supabase.co
SUPABASE_SERVICE_KEY=SUA_CHAVE_AQUI  # ← Coloque sua chave aqui
```

**Onde pegar a chave:**
1. Vá em: https://supabase.com/dashboard
2. Seu projeto → Settings → API
3. Copie `service_role` (NÃO a `anon`!)
4. Cole no `.env`

## ▶️ Iniciar o Servidor

**Windows:**
```bash
start-windows.bat
```

**Linux/Mac:**
```bash
chmod +x start-v3.sh
./start-v3.sh
```

Você verá:
```
🚀 Servidor WhatsApp rodando na porta 3333
✅ Pronto para conexões!
```

**IMPORTANTE**: Deixe este terminal aberto! Não feche!

## 🗄️ Configurar no Banco de Dados

No Supabase, execute este SQL:

```sql
-- Primeiro, descubra seu tenant_id
SELECT id, name FROM tenants;

-- Depois, configure (substitua 'SEU_TENANT_ID'):
INSERT INTO integration_whatsapp (
  tenant_id,
  instance_name,
  api_url,
  webhook_secret,
  is_active
) VALUES (
  'SEU_TENANT_ID',  -- ← Cole o ID aqui
  'MINHA_EMPRESA',
  'http://localhost:3333',
  'secret123',
  true
)
ON CONFLICT (tenant_id) 
DO UPDATE SET 
  api_url = 'http://localhost:3333',
  is_active = true;
```

## 📱 Conectar no Site

1. Volte para o site
2. Clique no botão **"WhatsApp"** (canto inferior direito)
3. Clique em **"Conectar WhatsApp"**
4. QR Code vai aparecer! 📷
5. Abra WhatsApp no celular
6. Vá em: **Mais opções → Aparelhos conectados → Conectar aparelho**
7. Escaneie o QR Code
8. Pronto! ✅

## 🎉 Está Funcionando!

Você verá:
- Badge verde "Conectado" ✅
- Status "WhatsApp conectado e pronto"

Agora você pode:
- Enviar mensagens em massa
- Mensagens automáticas quando pedido é pago
- Mensagens quando item é adicionado
- E muito mais!

## ❓ Perguntas Comuns

### Preciso deixar meu computador ligado sempre?

**Para testes:** Não, só quando for usar

**Para produção (uso real):** Sim, ou coloque em servidor (veja `GUIA_RAPIDO_WHATSAPP.md`)

### Posso usar no celular?

Não, precisa ser em computador. Mas depois que conectar, funciona mesmo se fechar o computador (se estiver em servidor).

### Quanto custa?

**Localmente:** Grátis! (só usa sua internet)

**Em servidor:** $5-10/mês (Digital Ocean, Railway, etc.)

### E se o servidor cair?

As mensagens automáticas param. Quando voltar, reconecta sozinho.

### Posso ter várias empresas?

Sim! Use `server-whatsapp-multitenant.js`. Cada empresa tem seu QR Code.

## 🆘 Problemas?

### "Servidor WhatsApp não está rodando"
→ Execute `start-windows.bat` ou `start-v3.sh`

### "npm não é reconhecido"
→ Reinstale Node.js: https://nodejs.org/

### "Porta 3333 já em uso"
→ Mude para 3334 no `.env`: `PORT=3334`

### "QR Code não aparece"
→ Verifique se há erros no terminal onde o servidor está rodando

## 📚 Documentação Completa

- `GUIA_RAPIDO_WHATSAPP.md` - Guia completo passo a passo
- `COMO_INICIAR_SERVIDOR_WHATSAPP.md` - Detalhes técnicos
- `SERVIDOR_V3_README.md` - Documentação avançada

## ✅ Checklist Rápido

- [ ] Node.js instalado
- [ ] Arquivos baixados do Lovable
- [ ] `npm install` executado
- [ ] `.env` configurado com service_key
- [ ] Servidor iniciado (terminal aberto)
- [ ] SQL executado no Supabase
- [ ] QR Code escaneado no celular
- [ ] Badge verde no site

## 🎊 Sucesso!

Agora seu sistema está 100% funcional! 

As mensagens automáticas vão funcionar quando:
- Cliente adicionar produto no carrinho
- Pedido for marcado como pago
- Você enviar mensagem em massa

**Divirta-se! 🚀**
