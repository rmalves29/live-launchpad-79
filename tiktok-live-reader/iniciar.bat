@echo off
chcp 65001 >nul
title Cartzy - Leitor da live do TikTok
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo O Node.js nao esta instalado neste computador.
  echo Vou abrir o site: baixe a versao LTS, instale clicando em "Proximo" e depois abra este arquivo de novo.
  start https://nodejs.org/pt-br
  pause
  exit /b 1
)

if not exist "node_modules\tiktok-live-connector" (
  echo Primeira vez: instalando o leitor ^(leva menos de 1 minuto^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Nao consegui instalar. Confira a internet e tente de novo.
    pause
    exit /b 1
  )
)

node index.js
pause
