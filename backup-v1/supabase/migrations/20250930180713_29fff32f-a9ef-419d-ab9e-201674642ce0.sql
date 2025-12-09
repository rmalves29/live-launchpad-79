-- Migration 1: Adicionar novos tipos de template ao enum
ALTER TYPE whatsapp_template_type ADD VALUE IF NOT EXISTS 'SENDFLOW';
ALTER TYPE whatsapp_template_type ADD VALUE IF NOT EXISTS 'MSG_MASSA';