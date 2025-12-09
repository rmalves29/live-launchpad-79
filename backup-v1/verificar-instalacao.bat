@echo off
echo ========================================
echo   VERIFICACAO DE INSTALACAO
echo ========================================
echo.

echo Verificando Node.js...
node --version
if errorlevel 1 (
    echo ❌ Node.js NAO instalado
) else (
    echo ✓ Node.js instalado
)
echo.

echo Verificando npm...
npm --version
if errorlevel 1 (
    echo ❌ npm NAO instalado
) else (
    echo ✓ npm instalado
)
echo.

echo Verificando pacotes instalados...
echo.

if exist "node_modules\whatsapp-web.js" (
    echo ✓ whatsapp-web.js instalado
) else (
    echo ❌ whatsapp-web.js NAO instalado
)

if exist "node_modules\express" (
    echo ✓ express instalado
) else (
    echo ❌ express NAO instalado
)

if exist "node_modules\cors" (
    echo ✓ cors instalado
) else (
    echo ❌ cors NAO instalado
)

if exist "node_modules\qrcode-terminal" (
    echo ✓ qrcode-terminal instalado
) else (
    echo ❌ qrcode-terminal NAO instalado
)

if exist "node_modules\node-fetch" (
    echo ✓ node-fetch instalado
) else (
    echo ❌ node-fetch NAO instalado
)

echo.
echo Verificando Chrome...
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    echo ✓ Chrome encontrado: C:\Program Files\Google\Chrome\Application\chrome.exe
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    echo ✓ Chrome encontrado: C:\Program Files ^(x86^)\Google\Chrome\Application\chrome.exe
) else (
    echo ❌ Chrome NAO encontrado nas pastas padrão
    echo    Instale o Chrome de https://www.google.com/chrome/
)

echo.
echo ========================================
echo.
pause
