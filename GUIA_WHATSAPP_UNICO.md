# 📱 Guia WhatsApp - Instância Única Lovable

## ✅ Correção Aplicada

O servidor **NÃO reconecta automaticamente em caso de LOGOUT**, evitando o erro `EBUSY: resource busy or locked`.

---

## 🚀 Como Usar

### 1. Instalar
```bash
npm install whatsapp-web.js express cors qrcode-terminal node-fetch
```

### 2. Configurar `.env`
```env
SUPABASE_URL=https://hxtbsieodbtzgcvvkeqx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_chave
PORT=3333
```

### 3. Iniciar
```bash
node whatsapp-server-single.js
```

### 4. Escanear QR Code e aguardar
```
✅ Cliente WhatsApp pronto!
📱 Número: +553187136555
```

---

## 🔧 Resolver LOGOUT

Quando aparecer:
```
❌ LOGOUT DETECTADO
Error: EBUSY: resource busy or locked
```

**Execute:**
```powershell
.\fix-whatsapp-logout.ps1
```

**Depois:**
```bash
node whatsapp-server-single.js
```

---

## 📤 Endpoints

| URL | Método | Descrição |
|-----|--------|-----------|
| `/status` | GET | Status da conexão |
| `/send` | POST | Enviar mensagem |
| `/broadcast` | POST | Enviar para vários |
| `/send-product-canceled` | POST | Produto cancelado |
| `/logs` | GET | Ver logs |

---

## ⚠️ Causas de LOGOUT

1. **Múltiplas instâncias** - Rodar o servidor 2+ vezes
2. **QR em múltiplos lugares** - Escanear em outro servidor
3. **Sessão expirada** - Mudança de IP ou sessão antiga

---

## ✅ Boas Práticas

- ✔️ 1 instância por número
- ✔️ Aguarde status "online"
- ✔️ Use `fix-whatsapp-logout.ps1`
- ❌ Não rode múltiplos servidores
- ❌ Não escaneie QR em vários lugares

---

## 📊 Verificar Status

```bash
curl http://localhost:3333/status
```

**Esperado:**
```json
{
  "status": "online",
  "number": "553187136555",
  "online": true
}
```

---

✨ **Pronto para usar!**
