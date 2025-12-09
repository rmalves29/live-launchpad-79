@echo off
echo ================================================
echo  INSTALACAO CHROMIUM - Puppeteer
echo ================================================
echo.

echo [1/3] Verificando instalacao atual...
node -e "try { const p = require('puppeteer'); console.log('Puppeteer instalado:', p.executablePath()); } catch(e) { console.log('Puppeteer nao encontrado'); }"
echo.

echo [2/3] Forçando download do Chromium...
echo Isso pode demorar alguns minutos (aproximadamente 300MB)...
echo.

REM Garantir que a variável de ambiente está configurada
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false

REM Reinstalar puppeteer com download forçado
call npm uninstall puppeteer
call npm install puppeteer@latest --force

echo.
echo [3/3] Verificando instalacao final...
node -e "try { const p = require('puppeteer'); console.log('✓ Chromium instalado em:', p.executablePath()); } catch(e) { console.log('✗ Erro:', e.message); }"
echo.

echo ================================================
echo  INSTALACAO CONCLUIDA
echo ================================================
echo.
echo Proximos passos:
echo 1. Execute: start-clean.bat
echo 2. Aguarde o QR Code aparecer
echo.

pause
