@echo off
echo ================================================
echo  TESTE DE CONECTIVIDADE - WhatsApp Web
echo ================================================
echo.

echo [1/4] Testando DNS do WhatsApp...
ping -n 3 web.whatsapp.com
echo.

echo [2/4] Testando HTTPS do WhatsApp...
curl -I https://web.whatsapp.com 2>nul
if %errorlevel% neq 0 (
    echo    ❌ ERRO: Nao consegue acessar WhatsApp Web
    echo    Possivel bloqueio de firewall/proxy/VPN
) else (
    echo    ✓ WhatsApp Web acessivel
)
echo.

echo [3/4] Testando DNS do Supabase...
ping -n 3 hxtbsieodbtzgcvvkeqx.supabase.co
echo.

echo [4/4] Verificando versoes...
echo Node.js:
node --version
echo.
echo NPM:
npm --version
echo.

echo ================================================
echo  ANALISE:
echo ================================================
echo.
echo Se todos os pings funcionaram = Rede OK
echo Se curl funcionou = HTTPS OK
echo Se algum falhou = Problema de firewall/rede
echo.

pause
