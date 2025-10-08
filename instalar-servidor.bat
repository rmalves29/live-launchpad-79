@echo off
echo ========================================
echo   INSTALADOR DO SERVIDOR WHATSAPP
echo ========================================
echo.

REM Verificar se Node.js está instalado
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado!
    echo.
    echo Por favor, instale o Node.js primeiro:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js encontrado!
node --version
echo.

REM Verificar se package.json existe
if not exist package.json (
    echo [INFO] Copiando package.json...
    copy package-servidor-whatsapp.json package.json >nul
)

REM Instalar dependências
echo [INFO] Instalando dependencias...
echo Isso pode demorar alguns minutos...
echo.
call npm install

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha ao instalar dependencias!
    pause
    exit /b 1
)

echo.
echo ========================================
echo   INSTALACAO CONCLUIDA COM SUCESSO!
echo ========================================
echo.

REM Verificar se .env existe
if not exist .env (
    echo [AVISO] Arquivo .env nao encontrado!
    echo.
    echo Criando .env de exemplo...
    copy .env.exemplo .env >nul
    echo.
    echo IMPORTANTE: Edite o arquivo .env e preencha suas credenciais!
    echo   - SUPABASE_SERVICE_KEY
    echo.
    echo Abra o arquivo .env em um editor de texto e configure.
    echo.
)

echo.
echo Proximos passos:
echo 1. Configure o arquivo .env com suas credenciais
echo 2. Execute: start-windows.bat
echo 3. No site, va em WhatsApp e conecte
echo.
pause
