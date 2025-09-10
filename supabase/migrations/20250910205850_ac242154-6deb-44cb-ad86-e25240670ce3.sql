-- Verificar e corrigir o trigger de criação de profiles
-- 1) Verificar se a função handle_new_user existe e está correta
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
    -- Log para debug
    INSERT INTO profiles (id, email, role, tenant_id, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        'staff'::user_role,
        NULL,
        now(),
        now()
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Se der erro, pelo menos logamos
    RAISE LOG 'Erro ao criar profile para usuário %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 2) Recriar o trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_new_user();

-- 3) Verificar usuários do auth que não tem profile
DO $$
DECLARE
    missing_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO missing_count
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id
    WHERE p.id IS NULL;
    
    IF missing_count > 0 THEN
        RAISE NOTICE 'Encontrados % usuários sem profile. Criando profiles...', missing_count;
        
        INSERT INTO public.profiles (id, email, role, tenant_id, created_at, updated_at)
        SELECT u.id, u.email, 'staff'::user_role, NULL, now(), now()
        FROM auth.users u
        LEFT JOIN public.profiles p ON u.id = p.id
        WHERE p.id IS NULL;
        
        RAISE NOTICE 'Profiles criados com sucesso!';
    ELSE
        RAISE NOTICE 'Todos os usuários já possuem profiles.';
    END IF;
END $$;