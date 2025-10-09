# ⚡ INICIAR WHATSAPP AGORA - 3 Passos Simples

## ✅ Configuração do Banco de Dados
**Status:** ✅ **JÁ CONFIGURADO!**
- Tenant ID: `08f2b1b9-3988-489e-8186-c60f0c0b0622`
- URL: `http://localhost:3333`
- Ativo: `true`

---

## 🚀 SIGA ESTES 3 PASSOS:

### 📍 PASSO 1: Abrir Terminal
Abra um **terminal/cmd** na pasta do projeto

---

### 📍 PASSO 2: Executar o Servidor

**Windows:**
```batch
start-empresa1.bat
```

**Linux/Mac:**
```bash
chmod +x start-empresa1.sh
./start-empresa1.sh
```

Você verá:
```
================================================
  WhatsApp Server - MANIA DE MULHER
================================================

🏢 Empresa: Mania de Mulher
🔌 Porta: 3333
🆔 Tenant: 08f2b1b9-3988-489e-8186-c60f0c0b0622

🚀 Iniciando servidor...
🌐 Acesse: http://localhost:3333
```

**⚠️ NÃO FECHE ESTA JANELA!** Deixe rodando em segundo plano.

---

### 📍 PASSO 3: Conectar WhatsApp

1. **Abra o navegador** e acesse:
   ```
   http://localhost:3333
   ```

2. **Você verá um QR Code**

3. **No celular:**
   - Abra WhatsApp
   - Toque em ⋮ (Mais opções)
   - **"Aparelhos conectados"**
   - **"Conectar um aparelho"**
   - **Escaneie o QR Code**

4. **Aguarde ver:**
   ```
   ✅ WhatsApp CONECTADO e PRONTO!
   ```

---

## ✅ Pronto! Agora teste no sistema

1. Volte para o sistema web (React)
2. Vá em **Pedidos** ou **Mensagens**
3. Tente enviar uma mensagem
4. Deve funcionar! 🎉

---

## ⚠️ IMPORTANTE

- **SEMPRE** deixe o terminal rodando `start-empresa1.bat`
- Se fechar o terminal, o WhatsApp desconecta
- Para produção, use PM2 ou rode em servidor cloud

---

## 🐛 Se der erro

### Erro: "Porta 3333 já em uso"
```batch
# Matar processo na porta 3333
netstat -ano | findstr :3333
taskkill /PID <PID> /F
```

### Erro: "Could not find Chromium"
```batch
npm install puppeteer@21.0.0 --force
```

### QR Code não aparece
```batch
# Limpar sessão antiga
rmdir /s /q C:\ProgramData\OrderZaps
# Reiniciar servidor
start-empresa1.bat
```

---

## 📞 Verificação Rápida

```batch
# Testar se o servidor está rodando
curl http://localhost:3333/status

# Deve retornar JSON com status
```
