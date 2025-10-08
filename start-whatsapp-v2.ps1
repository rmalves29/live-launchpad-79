# Script para iniciar o Servidor WhatsApp V2
# Executa com: .\start-whatsapp-v2.ps1

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Servidor WhatsApp V2" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Definir Tenant ID (opcional - use o padrão se não especificar)
# $env:TENANT_ID = "seu-tenant-id-aqui"

# Verificar dependências
Write-Host "Verificando dependências..." -ForegroundColor Yellow

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERRO: Node.js não encontrado!" -ForegroundColor Red
    Write-Host "Instale o Node.js em: https://nodejs.org/" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependências..." -ForegroundColor Yellow
    npm install whatsapp-web.js express cors qrcode-terminal node-fetch qrcode
}

Write-Host ""
Write-Host "Iniciando servidor..." -ForegroundColor Green
Write-Host ""

# Iniciar servidor
node server-whatsapp-v2.js
