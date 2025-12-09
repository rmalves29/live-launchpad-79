@echo off
cls
echo.
echo  ╔═══════════════════════════════════════════════════╗
echo  ║                                                   ║
echo  ║       SERVIDOR WHATSAPP - INICIO RAPIDO          ║
echo  ║                                                   ║
echo  ╚═══════════════════════════════════════════════════╝
echo.
echo.
echo  Escolha uma opcao:
echo.
echo  [1] Verificar instalacao
echo  [2] Instalar dependencias e iniciar servidor
echo  [3] Apenas iniciar servidor (se ja instalado)
echo  [4] Sair
echo.
set /p opcao="Digite o numero da opcao: "

if "%opcao%"=="1" (
    echo.
    call verificar-instalacao.bat
    goto :inicio
)

if "%opcao%"=="2" (
    echo.
    call instalar-e-iniciar.bat
    goto :fim
)

if "%opcao%"=="3" (
    echo.
    echo Iniciando servidor...
    node server1.js
    goto :fim
)

if "%opcao%"=="4" (
    goto :fim
)

echo.
echo Opcao invalida!
timeout /t 2 >nul
goto :inicio

:inicio
cls
goto :menu

:fim
pause
