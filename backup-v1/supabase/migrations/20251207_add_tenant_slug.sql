-- Migration: Adiciona slug único para cada tenant
-- Permite acesso via path-based routing (ex: /loja-da-maria)
-- Ao invés de subdomínios (ex: loja-da-maria.seusite.com)

-- Adicionar coluna slug
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug VARCHAR(100);

-- Tornar slug único
ALTER TABLE tenants ADD CONSTRAINT tenants_slug_unique UNIQUE (slug);

-- Criar índice para buscas rápidas por slug
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

-- Função para gerar slug automático a partir do nome
CREATE OR REPLACE FUNCTION generate_slug(name TEXT) 
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 1;
BEGIN
  -- Converter para minúsculas e remover acentos
  base_slug := lower(unaccent(name));
  
  -- Substituir espaços e caracteres especiais por hífens
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  
  -- Remover hífens no início e fim
  base_slug := trim(both '-' from base_slug);
  
  -- Limitar a 100 caracteres
  base_slug := substring(base_slug from 1 for 100);
  
  final_slug := base_slug;
  
  -- Verificar se slug já existe e adicionar número se necessário
  WHILE EXISTS (SELECT 1 FROM tenants WHERE slug = final_slug) LOOP
    final_slug := base_slug || '-' || counter;
    counter := counter + 1;
  END LOOP;
  
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Gerar slugs para tenants existentes (se houver)
UPDATE tenants 
SET slug = generate_slug(name)
WHERE slug IS NULL;

-- Trigger para gerar slug automaticamente ao criar novo tenant
CREATE OR REPLACE FUNCTION auto_generate_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_slug(NEW.name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_generate_slug
  BEFORE INSERT OR UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_slug();

-- Adicionar comentário
COMMENT ON COLUMN tenants.slug IS 'Slug único para acesso via URL (ex: /loja-da-maria)';

-- Mostrar tenants com seus novos slugs
-- SELECT id, name, slug, domain FROM tenants ORDER BY created_at;
