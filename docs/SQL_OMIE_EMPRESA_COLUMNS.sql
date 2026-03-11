-- ============================================
-- SQL: Adicionar colunas de empresa à integration_omie
-- Execute no SQL Editor do Supabase
-- ============================================

-- Adicionar colunas para empresa selecionada
ALTER TABLE public.integration_omie 
ADD COLUMN IF NOT EXISTS omie_empresa_id bigint DEFAULT NULL,
ADD COLUMN IF NOT EXISTS omie_empresa_nome text DEFAULT NULL;

-- Comentários
COMMENT ON COLUMN public.integration_omie.omie_empresa_id IS 'ID da empresa selecionada no Omie';
COMMENT ON COLUMN public.integration_omie.omie_empresa_nome IS 'Nome da empresa selecionada no Omie';
