#!/bin/bash

echo "================================================"
echo " WhatsApp Multi-Tenant Server - Clean v4.0"
echo "================================================"
echo ""

# Definir variáveis de ambiente
export SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA"
export PORT=3333

echo "Iniciando servidor WhatsApp..."
echo ""

echo "📦 Instalando/verificando dependências..."
npm install whatsapp-web.js@latest express@latest cors@latest qrcode-terminal@latest node-fetch@2.7.0

echo ""
echo "🚀 Iniciando servidor..."
echo ""

node server-multitenant-clean.js
