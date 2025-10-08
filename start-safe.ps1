# start-safe.ps1 - Inicialização Segura do Servidor WhatsApp
# Uso: .\start-safe.ps1

Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🚀 INICIALIZADOR SEGURO - WhatsApp Automation" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# 1. Parar processos Node.js existentes
Write-Host "🛑 Parando processos Node.js existentes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    $nodeProcesses | ForEach-Object {
        Write-Host "   ├─ Encerrando PID $($_.Id)..." -ForegroundColor Gray
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "   └─ ✅ $($nodeProcesses.Count) processo(s) encerrado(s)" -ForegroundColor Green
} else {
    Write-Host "   └─ ✅ Nenhum processo Node.js rodando" -ForegroundColor Green
}

# 2. Parar processos Chrome/Chromium (Puppeteer)
Write-Host ""
Write-Host "🌐 Parando processos Chrome..." -ForegroundColor Yellow
$chromeProcesses = Get-Process -Name "chrome" -ErrorAction SilentlyContinue
if ($chromeProcesses) {
    $chromeProcesses | ForEach-Object {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "   └─ ✅ Chrome encerrado" -ForegroundColor Green
} else {
    Write-Host "   └─ ✅ Chrome não está rodando" -ForegroundColor Green
}

# 3. Aguardar liberação de recursos
Write-Host ""
Write-Host "⏳ Aguardando 3 segundos para liberação de recursos..." -ForegroundColor Cyan
Start-Sleep -Seconds 3

# 4. Limpar arquivos de lock (OPCIONAL - só se tiver problemas)
$cleanLockFiles = $false  # Mude para $true se tiver erros EBUSY persistentes

if ($cleanLockFiles) {
    Write-Host ""
    Write-Host "🗑️ Limpando arquivos de lock..." -ForegroundColor Yellow
    
    $lockFiles = @(
        ".\.wwebjs_auth\session-app\SingletonLock",
        ".\.wwebjs_auth\session-app\SingletonCookie",
        ".\.wwebjs_auth\session-app\SingletonSocket",
        ".\.wwebjs_auth\session-app\first_party_sets.db-journal"
    )
    
    $removedCount = 0
    foreach ($file in $lockFiles) {
        if (Test-Path $file) {
            try {
                Remove-Item $file -Force -ErrorAction Stop
                $removedCount++
            } catch {
                Write-Host "   ⚠️ Não foi possível remover: $file" -ForegroundColor DarkYellow
            }
        }
    }
    
    if ($removedCount -gt 0) {
        Write-Host "   └─ ✅ $removedCount arquivo(s) de lock removido(s)" -ForegroundColor Green
    } else {
        Write-Host "   └─ ✅ Nenhum arquivo de lock encontrado" -ForegroundColor Green
    }
}

# 5. Verificar se a porta 3333 está livre
Write-Host ""
Write-Host "🔍 Verificando porta 3333..." -ForegroundColor Cyan
$portInUse = Get-NetTCPConnection -LocalPort 3333 -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "   ⚠️ Porta 3333 em uso por PID $($portInUse.OwningProcess)" -ForegroundColor Yellow
    Write-Host "   └─ Tentando liberar..." -ForegroundColor Yellow
    Stop-Process -Id $portInUse.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# 6. Iniciar servidor
Write-Host ""
Write-Host "════════════════════════════════════════════" -ForegroundColor Green
Write-Host "🚀 Iniciando servidor WhatsApp..." -ForegroundColor Green
Write-Host "════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Para parar o servidor: Ctrl+C" -ForegroundColor Cyan
Write-Host "💡 Documentação: BOAS_PRATICAS_SERVIDOR.md" -ForegroundColor Cyan
Write-Host ""

# Executar o servidor
node server-whatsapp-unified.js

# Se o servidor foi encerrado normalmente
Write-Host ""
Write-Host "👋 Servidor encerrado" -ForegroundColor Gray
