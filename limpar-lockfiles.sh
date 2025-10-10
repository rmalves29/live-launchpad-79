#!/bin/bash

echo "========================================="
echo "   LIMPEZA DE LOCKFILES DO WHATSAPP"
echo "========================================="
echo ""

echo "Removendo lockfiles antigos..."
find .wwebjs_auth -type f \( -name "*lockfile*" -o -name "*.lock" \) -delete 2>/dev/null

echo ""
echo "✅ Limpeza concluída!"
echo ""
echo "Agora você pode executar: node server1.js"
echo ""
