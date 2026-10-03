-- Enquetes no Fluxo de Envio: pergunta fica em content_text, opcoes em poll_options.
ALTER TABLE public.fe_messages
  ADD COLUMN IF NOT EXISTS poll_options jsonb,
  ADD COLUMN IF NOT EXISTS poll_selectable_count integer;

ALTER TABLE public.fe_messages DROP CONSTRAINT IF EXISTS fe_messages_content_type_check;
ALTER TABLE public.fe_messages
  ADD CONSTRAINT fe_messages_content_type_check
  CHECK (content_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'video'::text, 'video_note'::text, 'poll'::text]));
