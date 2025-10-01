#!/bin/bash
# Script para iniciar servidor Empresa 2

echo "🚀 Iniciando servidor Empresa 2..."

# Carregar variáveis de ambiente
export $(cat config-empresa2.env | xargs)

# Iniciar servidor
node server-whatsapp-individual.js
