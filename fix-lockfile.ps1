# fix-lockfile.ps1 - Script para resolver erro EBUSY: lockfile travado
# Uso: .\fix-lockfile.ps1

Write-Host "🔧 =============================================" -ForegroundColor Cyan
Write-Host "🔧 FIX LOCKFILE - Resolver erro EBUSY" -ForegroundColor Cyan
Write-Host "🔧 =============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Parar TODOS os processos Node.js
Write-Host "🛑 Parando TODOS os processos Node.js..." -ForegroundColor Yellow
try {
    taskkill /F /IM node.exe 2>$null
    Write-Host "✅ Processos Node.js finalizados" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Nenhum processo Node.js encontrado" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "⏳ Aguardando 3 segundos..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# 2. Remover sessões travadas
Write-Host ""
Write-Host "🧹 Limpando arquivos travados..." -ForegroundColor Yellow

if (Test-Path ".\.wwebjs_auth") {
    try {
        Remove-Item -Recurse -Force ".\.wwebjs_auth" -ErrorAction Stop
        Write-Host "✅ Sessões WhatsApp removidas" -ForegroundColor Green
    } catch {
        Write-Host "❌ Erro ao remover .wwebjs_auth: $_" -ForegroundColor Red
        Write-Host "⚠️  Tente fechar TODOS os programas que possam estar usando os arquivos" -ForegroundColor Yellow
    }
} else {
    Write-Host "ℹ️  Pasta .wwebjs_auth não existe" -ForegroundColor Cyan
}

if (Test-Path ".\.wwebjs_cache") {
    try {
        Remove-Item -Recurse -Force ".\.wwebjs_cache" -ErrorAction Stop
        Write-Host "✅ Cache WhatsApp removido" -ForegroundColor Green
    } catch {
        Write-Host "❌ Erro ao remover .wwebjs_cache: $_" -ForegroundColor Red
    }
} else {
    Write-Host "ℹ️  Pasta .wwebjs_cache não existe" -ForegroundColor Cyan
}

# 3. Informações finais
Write-Host ""
Write-Host "✅ =============================================" -ForegroundColor Green
Write-Host "✅ LIMPEZA CONCLUÍDA!" -ForegroundColor Green
Write-Host "✅ =============================================" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Próximos passos:" -ForegroundColor Cyan
Write-Host "   1. Execute o servidor novamente:" -ForegroundColor White
Write-Host "      node server-whatsapp-individual-no-env.js" -ForegroundColor Yellow
Write-Host ""
Write-Host "   2. Escaneie o QR Code quando aparecer" -ForegroundColor White
Write-Host ""
