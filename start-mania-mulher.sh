#!/bin/bash
# Script para iniciar servidor Mania de Mulher

echo "🚀 Iniciando servidor Mania de Mulher..."

# Carregar variáveis de ambiente
export $(cat config-mania-mulher.env | xargs)

# Iniciar servidor
node server-whatsapp-individual.js
