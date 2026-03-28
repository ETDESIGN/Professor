-- Migration: Fix the Database Trigger (Enum Casting)
-- Created: 2026-03-25
-- Description: Explicitly casts the role from raw_user_meta_data to public.user_role enum. This prevents the silent 400 errors during signup.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unknown'),
    CAST(LOWER(COALESCE(NEW.raw_user_meta_data->>'role', 'student')) AS public.user_role)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- If insert fails (e.g., schema mismatch), don't crash the signup 500!
  RAISE LOG 'Profile creation failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
