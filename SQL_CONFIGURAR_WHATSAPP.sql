-- ================================================
-- CONFIGURAÇÃO WHATSAPP INDIVIDUAL POR TENANT
-- ================================================
-- Execute este SQL no Supabase SQL Editor
-- para configurar a URL do servidor WhatsApp

-- 1️⃣ MANIA DE MULHER (Empresa 1)
-- Tenant ID: 08f2b1b9-3988-489e-8186-c60f0c0b0622
-- Porta: 3333

-- Primeiro, deletar configuração antiga se existir
DELETE FROM integration_whatsapp 
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';

-- Inserir nova configuração
INSERT INTO integration_whatsapp (
  tenant_id,
  api_url,
  is_active,
  created_at,
  updated_at
) VALUES (
  '08f2b1b9-3988-489e-8186-c60f0c0b0622',
  'http://localhost:3333',
  true,
  now(),
  now()
);

-- ================================================
-- 2️⃣ EMPRESA 2 (Template para adicionar)
-- ================================================
-- Descomente e modifique quando adicionar Empresa 2:
-- 
-- DELETE FROM integration_whatsapp 
-- WHERE tenant_id = 'SEU-TENANT-ID-AQUI';
-- 
-- INSERT INTO integration_whatsapp (
--   tenant_id,
--   api_url,
--   is_active,
--   created_at,
--   updated_at
-- ) VALUES (
--   'SEU-TENANT-ID-AQUI',
--   'http://localhost:3334',  -- Porta diferente!
--   true,
--   now(),
--   now()
-- );

-- ================================================
-- ✅ VERIFICAR CONFIGURAÇÃO
-- ================================================
SELECT 
  tenant_id,
  api_url,
  is_active,
  created_at,
  updated_at
FROM integration_whatsapp
ORDER BY created_at DESC;

-- ================================================
-- 📊 VERIFICAR COM NOME DA EMPRESA
-- ================================================
SELECT 
  t.name as empresa,
  t.slug,
  t.id as tenant_id,
  iw.api_url,
  iw.is_active as whatsapp_ativo
FROM tenants t
LEFT JOIN integration_whatsapp iw ON iw.tenant_id = t.id
WHERE t.is_active = true
ORDER BY t.name;
