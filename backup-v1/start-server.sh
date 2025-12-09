#!/bin/bash
echo "===================================="
echo "  WhatsApp Multi-Tenant Server"
echo "===================================="
echo ""

# Configurar variável de ambiente
export SUPABASE_SERVICE_ROLE_KEY="COLE_SUA_SERVICE_ROLE_KEY_AQUI"

# Iniciar servidor
echo "Iniciando servidor na porta 3333..."
node server1.js
