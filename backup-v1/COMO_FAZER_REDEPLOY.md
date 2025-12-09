# 🚀 Como Fazer Redeploy no Railway

## ❌ Problema Atual

Você está vendo código antigo porque:
1. ✅ Código foi alterado no GitHub
2. ❌ Railway ainda está servindo a versão antiga
3. ❌ Precisa fazer **REDEPLOY** para atualizar

---

## 🎯 Solução: Fazer Redeploy

### **PASSO 1: Acessar Railway**

1. Abra: **https://railway.app/dashboard**
2. Faça login (se necessário)

### **PASSO 2: Entrar no Projeto**

1. Localize o projeto: **orderzaps** (ou nome similar)
2. Clique para abrir

### **PASSO 3: Fazer Redeploy**

#### **Opção A: Redeploy Manual (Recomendado)**

1. Dentro do projeto, clique na aba **"Deployments"**
2. Clique nos **três pontinhos (⋮)** ao lado do último deploy
3. Clique em **"Redeploy"**
4. Aguarde 2-3 minutos até ficar verde ✅

#### **Opção B: Novo Deploy via Git**

1. Vá na aba **"Settings"**
2. Role até **"Service Settings"**
3. Clique em **"Redeploy"** ou **"Trigger Deploy"**

#### **Opção C: Force Deploy**

1. Na aba **"Deployments"**
2. Clique em **"Deploy"** (botão superior direito)
3. Selecione a branch **"main"**
4. Clique em **"Deploy"**

---

## ⏱️ Tempo de Deploy

- **Build:** 1-2 minutos
- **Deploy:** 30 segundos
- **Total:** ~2-3 minutos

Aguarde até o status ficar **verde** ✅

---

## ✅ Como Verificar se Deu Certo

### **1. Verificar Status do Deploy**

Na aba **"Deployments"**, o último deploy deve mostrar:
```
✅ SUCCESS
🟢 Running
```

### **2. Testar Página de Login**

1. Abra em uma **aba anônima** (Ctrl+Shift+N):
   ```
   https://app.orderzaps.com/auth
   ```

2. **✅ Deve ver:**
   - Página limpa (SEM navbar)
   - Apenas formulário de login

3. **❌ Se ainda ver navbar:**
   - Limpe cache: `Ctrl+Shift+R`
   - Aguarde mais 1 minuto
   - Tente em aba anônima novamente

### **3. Testar Menu Integrações**

1. Faça login em `https://app.orderzaps.com/auth`
2. Após login, verifique o menu
3. **✅ Deve ver:**
   - Link "Integrações" no menu principal
   - Entre "Etiquetas" e "⚙️ Gerenciar Empresas"

4. Clique em "Integrações"
5. **✅ Deve abrir:** `/integracoes`
6. **✅ Deve mostrar:**
   - Seção Mercado Pago
   - Seção Melhor Envio

---

## 🐛 Troubleshooting

### ❌ Deploy falhou (vermelho)

**Ver logs:**
1. Clique no deploy com erro
2. Veja a aba **"Build Logs"** ou **"Deploy Logs"**
3. Procure por erros em vermelho
4. Me envie o erro para eu ajudar

### ❌ Menu "Integrações" ainda não aparece

**Possíveis causas:**

#### **1. Cache do Navegador**
```
Solução: Ctrl+Shift+R ou aba anônima
```

#### **2. Deploy ainda não terminou**
```
Solução: Aguarde até status ficar verde ✅
```

#### **3. Usuário sem tenant_id**
```
Verificar no Supabase:
SELECT id, email, tenant_id, role FROM profiles WHERE email = 'rmalves21@hotmail.com';

Se tenant_id estiver NULL:
UPDATE profiles SET tenant_id = 'UUID-DO-TENANT' WHERE email = 'rmalves21@hotmail.com';
```

#### **4. Usando URL errada**
```
❌ Errado: https://orderzaps.com/auth
✅ Correto: https://app.orderzaps.com/auth

(Ou o domínio que você configurou no Railway)
```

### ❌ Navbar ainda aparece em /auth

**Possíveis causas:**

#### **1. Deploy antigo ainda ativo**
```
Solução: Fazer redeploy novamente
```

#### **2. Cache do CDN/Cloudflare**
```
Solução:
1. Aguardar 5 minutos
2. Limpar cache do Cloudflare (se usar)
3. Usar aba anônima
```

---

## 📸 Como Deve Ficar Depois do Deploy

### **Página /auth (SEM navbar)**
```
┌─────────────────────────────────────┐
│                                     │
│          [LOGO ORDER ZAPS]          │
│                                     │
│   MANIA DE MULHER                   │
│   entre com suas credenciais        │
│                                     │
│   E-mail                            │
│   [mhalves21@hotmail.com      ]     │
│                                     │
│   Senha                             │
│   [••••••••••                 ]     │
│                                     │
│   [    Entrar    ]                  │
│                                     │
└─────────────────────────────────────┘
```

### **Outras páginas (COM navbar e menu Integrações)**
```
┌──────────────────────────────────────────────────────────┐
│ [LOGO] Pedidos Manual | Live | Checkout | Produtos ...  │
│        Clientes | Pedidos | Relatórios | Sorteio |      │
│        Etiquetas | INTEGRAÇÕES | ⚙️ Gerenciar Empresas  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│              [CONTEÚDO DA PÁGINA]                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
                      ↑ Menu "Integrações" aqui!
```

---

## 📋 Checklist Rápido

Depois do redeploy:

- [ ] Aguardei 2-3 minutos até deploy ficar verde ✅
- [ ] Abri aba anônima (Ctrl+Shift+N)
- [ ] Acessei `/auth` e navbar **não** aparece
- [ ] Fiz login
- [ ] Navbar **aparece** nas outras páginas
- [ ] Link "Integrações" está visível no menu
- [ ] Cliquei em "Integrações"
- [ ] Página `/integracoes` abriu com campos de Mercado Pago e Melhor Envio

---

## 🎯 Resumo Rápido

```bash
1. Acesse: https://railway.app/dashboard
2. Entre no projeto: orderzaps
3. Aba: "Deployments"
4. Clique: ⋮ → "Redeploy"
5. Aguarde: 2-3 minutos ✅
6. Teste: https://app.orderzaps.com/auth
7. Limpe cache: Ctrl+Shift+R
8. ✅ Navbar não deve aparecer em /auth
9. ✅ Menu "Integrações" deve aparecer após login
```

---

## 📞 Se Continuar com Problema

Me envie:

1. **Print da aba "Deployments"** do Railway
   - Mostrando o status do último deploy

2. **Print da página /auth**
   - Mostrando se navbar aparece ou não

3. **Print do console do navegador** (F12 → Console)
   - Se houver erros em vermelho

4. **Resultado desta query no Supabase:**
```sql
SELECT id, email, tenant_id, role FROM profiles WHERE email = 'rmalves21@hotmail.com';
```

---

**IMPORTANTE:** As alterações estão no GitHub, mas Railway precisa fazer um novo deploy para aplicá-las! 🚀
