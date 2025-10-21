-- Adicionar campo de dias de disponibilidade para postagem
ALTER TABLE app_settings 
ADD COLUMN handling_days integer DEFAULT 3;