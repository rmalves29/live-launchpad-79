-- Create trigger to populate public.profiles on new auth user and backfill missing rows
-- 1) Ensure trigger exists and points to public.handle_new_user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2) Backfill: insert profiles for existing auth users missing in public.profiles
INSERT INTO public.profiles (id, email, role, tenant_id)
SELECT u.id, u.email, 'staff'::user_role, NULL
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- 3) Ensure emails are synced for existing profiles with null/empty email
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');