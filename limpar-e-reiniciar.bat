@echo off
chcp 65001 > nul
cls

echo ============================================================
echo 🧹 LIMPANDO SESSÕES E REINICIANDO SERVIDOR
echo ============================================================
echo.

echo 🛑 Parando processos Node.js...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM chrome.exe 2>nul
timeout /t 3 /nobreak >nul

echo 🗑️ Removendo lockfiles travados...
if exist ".wwebjs_auth" (
    for /r ".wwebjs_auth" %%f in (lockfile*) do (
        del /f /q "%%f" 2>nul
        echo ✅ Removido: %%f
    )
)

echo 🗑️ Removendo sessões antigas...
if exist ".wwebjs_auth" (
    rmdir /s /q ".wwebjs_auth"
    echo ✅ Sessões removidas
) else (
    echo ⚠️ Nenhuma sessão encontrada
)

echo.
echo 🔄 Iniciando servidor com memória otimizada...
echo.

node --max-old-space-size=4096 server1.js
