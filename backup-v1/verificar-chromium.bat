@echo off
echo ================================================
echo  VERIFICACAO CHROMIUM - Diagnostico Completo
echo ================================================
echo.

echo [1/5] Verificando Node.js e NPM...
node --version
npm --version
echo.

echo [2/5] Verificando instalacao do Puppeteer...
npm list puppeteer
echo.

echo [3/5] Verificando caminho do Chromium...
node -e "try { const puppeteer = require('puppeteer'); const path = puppeteer.executablePath(); console.log('✓ Chromium encontrado em:'); console.log('  ', path); const fs = require('fs'); if (fs.existsSync(path)) { console.log('✓ Arquivo existe'); } else { console.log('✗ Arquivo NAO existe'); } } catch(e) { console.log('✗ Erro:', e.message); console.log(''); console.log('SOLUCAO:'); console.log('Execute: instalar-chromium.bat'); }"
echo.

echo [4/5] Verificando espaco em disco...
dir | find "bytes"
echo.

echo [5/5] Verificando variaveis de ambiente...
echo PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=%PUPPETEER_SKIP_CHROMIUM_DOWNLOAD%
echo.

echo ================================================
echo  DIAGNOSTICO COMPLETO
echo ================================================
echo.
echo Se o Chromium NAO foi encontrado:
echo   Execute: instalar-chromium.bat
echo.
echo Se o Chromium foi encontrado:
echo   Execute: start-clean.bat
echo.

pause
