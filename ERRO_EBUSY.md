# 🔧 SOLUÇÃO: Erro EBUSY (resource busy or locked)

## ⚠️ Problema
```
Error: EBUSY: resource busy or locked, unlink 'C:\whatsapp-automacao\.wwebjs_auth_simple\...'
```

Este erro acontece quando:
- Você está rodando MÚLTIPLAS instâncias do servidor ao mesmo tempo
- Arquivos de sessão ficaram travados após um crash
- O Windows não liberou os arquivos ainda

---

## ✅ SOLUÇÃO RÁPIDA

### 1. Parar TUDO e Limpar
```cmd
parar-tudo.bat
```

Este script vai:
- ✅ Encerrar TODOS os processos Node.js
- ✅ Limpar TODAS as sessões (.wwebjs_auth_*)
- ✅ Aguardar 2 segundos para liberar arquivos

### 2. Iniciar Apenas UMA Vez
```cmd
start-windows.bat
```

**IMPORTANTE:**
- ⚠️ Execute o servidor APENAS UMA VEZ
- ⚠️ NÃO abra múltiplas janelas/terminais rodando o servidor
- ⚠️ NÃO rode `server-simples-1-tenant.js` e `server1.js` ao mesmo tempo

---

## 🎯 Prevenção

### Verificar se já está rodando
Antes de iniciar o servidor, verifique:

```cmd
# Ver processos Node rodando
tasklist | findstr node.exe
```

Se aparecer algo, mate os processos:
```cmd
taskkill /F /IM node.exe
```

### Sempre use o mesmo servidor
- ✅ Para produção: `start-windows.bat` (servidor completo multi-tenant)
- ✅ Para testar: `node server-simples-1-tenant.js` (apenas teste, depois mate)
- ❌ NÃO rode os dois ao mesmo tempo!

---

## 🔍 Entendendo o Erro

O erro `EBUSY` acontece porque:

1. **Arquivo de sessão está aberto** por outro processo
2. **Windows não liberou o handle** do arquivo ainda
3. **Múltiplas instâncias** tentando acessar o mesmo arquivo

```
.wwebjs_auth_simple/           ← Sessão do server-simples-1-tenant.js
.wwebjs_auth_v2/              ← Sessão do server1.js (multi-tenant)
  └── tenant_XXX/             ← Uma pasta por tenant
```

Se você rodar:
- `server-simples-1-tenant.js` → Usa `.wwebjs_auth_simple`
- `server1.js` → Usa `.wwebjs_auth_v2`

Mas se rodar os DOIS ao mesmo tempo, eles podem conflitar!

---

## 🛠️ Comandos Úteis

### Parar Servidor
```cmd
# Se o servidor está rodando no terminal:
CTRL + C

# Se travou ou está em background:
parar-tudo.bat
```

### Limpar Apenas Sessões (sem matar processos)
```cmd
limpar-sessoes.bat
```

### Ver Status do Servidor
```cmd
curl http://localhost:3333/status
```

Se retornar JSON, o servidor ESTÁ RODANDO.
Se der erro de conexão, NÃO está rodando.

---

## 📋 Workflow Correto

### Para Usar o Sistema

1. **Verificar se já está rodando:**
   ```cmd
   curl http://localhost:3333/status
   ```

2. **Se NÃO estiver rodando:**
   ```cmd
   start-windows.bat
   ```

3. **Aguardar QR Code e escanear**

4. **Usar o sistema normalmente**

5. **Para parar:**
   ```cmd
   CTRL + C
   ```

### Para Debugar

1. **Parar tudo:**
   ```cmd
   parar-tudo.bat
   ```

2. **Testar simples:**
   ```cmd
   node server-simples-1-tenant.js
   ```

3. **Quando terminar, parar:**
   ```cmd
   CTRL + C
   ```

4. **Voltar para o normal:**
   ```cmd
   start-windows.bat
   ```

---

## ⚠️ NÃO FAÇA ISSO

❌ Abrir múltiplas janelas do terminal rodando o servidor
❌ Rodar `server1.js` e `server-simples-1-tenant.js` juntos
❌ Iniciar o servidor enquanto já tem um rodando
❌ Fechar o terminal sem fazer CTRL+C antes
❌ Remover arquivos `.wwebjs_auth_*` manualmente enquanto roda

---

## ✅ FAÇA ISSO

✅ Use `parar-tudo.bat` sempre que tiver dúvida
✅ Rode apenas UM servidor por vez
✅ Use CTRL+C para parar antes de fechar o terminal
✅ Verifique com `curl` se já está rodando antes de iniciar
✅ Aguarde o QR Code aparecer (pode levar 30-60s)

---

## 🆘 Erro Persiste?

Se mesmo após `parar-tudo.bat` o erro continuar:

### 1. Reinicie o Computador
Sim, sério. O Windows às vezes trava os handles e só solta após reiniciar.

### 2. Verifique Antivírus
Alguns antivírus "seguram" arquivos:
- Windows Defender
- Avast/AVG
- Norton
- Kaspersky

Adicione a pasta do projeto às exceções.

### 3. Verifique Permissões
```cmd
# Execute o terminal como Administrador
# Clique direito no CMD/PowerShell
# "Executar como Administrador"
```

### 4. Mova o Projeto
Se a pasta tem nome ou caminho muito longo:
```cmd
# Mova para:
C:\whatsapp
```

Caminhos curtos têm menos problemas no Windows.

---

## 📊 Checklist de Verificação

- [ ] Todos os processos Node.js encerrados (`parar-tudo.bat`)
- [ ] Todas as sessões limpas (sem `.wwebjs_auth_*`)
- [ ] Apenas UMA instância do servidor rodando
- [ ] Terminal aberto como Administrador (se necessário)
- [ ] Antivírus não está bloqueando
- [ ] Caminho do projeto não é muito longo
- [ ] Aguardei 2-3 segundos após matar processos

Se TODOS estiverem ✅, inicie o servidor normalmente.
