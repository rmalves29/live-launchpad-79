-- Criar usuário para tenant thaybiquini
-- Como não podemos chamar edge functions diretamente do SQL, vamos criar o usuário via API admin

-- Primeiro, vamos criar o usuário no auth.users diretamente (usando service role)
SELECT auth.admin_create_user(
  jsonb_build_object(
    'email', 'suporte.biquinidathay@gmail.com',
    'password', '123456789',
    'email_confirm', true
  )
);