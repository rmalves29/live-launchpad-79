@echo off
echo ========================================
echo   INICIANDO SERVIDOR BAILEYS
echo ========================================
echo.

echo [1/3] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERRO: Node.js nao encontrado!
    echo Instale em: https://nodejs.org/
    pause
    exit /b 1
)
echo OK - Node.js instalado
echo.

echo [2/3] Verificando dependencias...
if not exist "node_modules\@whiskeysockets\baileys" (
    echo AVISO: Baileys nao encontrado, instalando...
    npm install @whiskeysockets/baileys pino qrcode-terminal
) else (
    echo OK - Baileys instalado
)
echo.

echo [3/3] Iniciando servidor...
echo.
echo ========================================
echo   QR Code aparecera em instantes
echo ========================================
echo.
echo Acesse: http://localhost:3333/qr/08f2b1b9-3988-489e-8186-c60f0c0b0622
echo.

node server1.js

pause
