# ====================================
# SCRIPT DE CORREÇÃO - WHATSAPP LOGOUT
# ====================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "🔧 CORRIGINDO LOGOUT DO WHATSAPP" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. Parar TODOS os processos Node.js
Write-Host "🛑 Parando processos Node.js..." -ForegroundColor Yellow
taskkill /F /IM node.exe 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Processos Node.js finalizados" -ForegroundColor Green
} else {
    Write-Host "⚠️  Nenhum processo Node.js encontrado" -ForegroundColor DarkGray
}

# 2. Aguardar 3 segundos
Write-Host "`n⏳ Aguardando 3 segundos..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# 3. Limpar sessões WhatsApp
Write-Host "`n🧹 Limpando sessões WhatsApp..." -ForegroundColor Yellow

if (Test-Path ".\.wwebjs_auth") {
    try {
        Remove-Item -Recurse -Force ".\.wwebjs_auth" -ErrorAction Stop
        Write-Host "✅ Pasta .wwebjs_auth removida" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Erro ao remover .wwebjs_auth: $_" -ForegroundColor Red
        Write-Host "   Tente fechar o navegador Chrome e executar novamente" -ForegroundColor Yellow
    }
} else {
    Write-Host "ℹ️  Pasta .wwebjs_auth não existe" -ForegroundColor DarkGray
}

if (Test-Path ".\.wwebjs_cache") {
    try {
        Remove-Item -Recurse -Force ".\.wwebjs_cache" -ErrorAction Stop
        Write-Host "✅ Pasta .wwebjs_cache removida" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Erro ao remover .wwebjs_cache: $_" -ForegroundColor Red
    }
} else {
    Write-Host "ℹ️  Pasta .wwebjs_cache não existe" -ForegroundColor DarkGray
}

# 4. Conclusão
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "✅ LIMPEZA CONCLUÍDA!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`n📋 PRÓXIMOS PASSOS:" -ForegroundColor Yellow
Write-Host "   1. Execute: node whatsapp-server-single.js" -ForegroundColor White
Write-Host "   2. Escaneie o novo QR Code" -ForegroundColor White
Write-Host "   3. Aguarde a mensagem 'Cliente WhatsApp pronto!'" -ForegroundColor White

Write-Host "`n⚠️  IMPORTANTE:" -ForegroundColor Yellow
Write-Host "   - Use apenas UMA instância por número WhatsApp" -ForegroundColor White
Write-Host "   - Não escaneie o mesmo QR em múltiplos lugares" -ForegroundColor White
Write-Host "   - Verifique se não há outros servidores rodando" -ForegroundColor White
Write-Host "`n========================================`n" -ForegroundColor Cyan
