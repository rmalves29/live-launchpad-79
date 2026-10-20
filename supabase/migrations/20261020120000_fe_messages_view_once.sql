-- Envio como visualização única (só imagem, vídeo e áudio; provedor UazAPI).
alter table public.fe_messages add column if not exists view_once boolean not null default false;
comment on column public.fe_messages.view_once is 'Envio como visualização única (só imagem, vídeo e áudio; provedor UazAPI).';
