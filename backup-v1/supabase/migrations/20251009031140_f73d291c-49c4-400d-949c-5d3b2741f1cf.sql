-- Criar política para permitir inserções de sistemas externos (como servidor WhatsApp)
-- na tabela whatsapp_messages

CREATE POLICY "External services can insert whatsapp messages"
ON public.whatsapp_messages
FOR INSERT
TO anon, authenticated
WITH CHECK (true);