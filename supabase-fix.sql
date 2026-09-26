-- ============================================================
-- NoticePoint Supabase Fix: Profiles & auth.users Trigger
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/dpemtttsidzjpadumrba/sql/new
-- ============================================================

-- 1. Ensure the profiles table has all necessary columns with sensible defaults
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone_number TEXT,
  district TEXT DEFAULT 'Adentan Municipal',
  neighborhood TEXT DEFAULT 'General',
  role TEXT DEFAULT 'citizen',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Ensure RLS is enabled on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Setup proper Row Level Security policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- 4. Create or replace the handle_new_user function with SECURITY DEFINER
-- SECURITY DEFINER allows this function to bypass RLS during signup.
-- COALESCE ensures NOT NULL constraints are never violated even if user metadata is empty.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name,
    phone_number,
    district,
    neighborhood,
    role
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Citizen'),
    NEW.raw_user_meta_data->>'phone_number',
    COALESCE(NEW.raw_user_meta_data->>'district', 'Adentan Municipal'),
    COALESCE(NEW.raw_user_meta_data->>'neighborhood', 'General'),
    'citizen'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone_number = EXCLUDED.phone_number,
    district = EXCLUDED.district,
    neighborhood = EXCLUDED.neighborhood;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Fallback: ensure the auth user is still created even if profile insertion encounters an unexpected issue
    RAISE WARNING 'handle_new_user failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- 5. Attach the trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 6. Alerts Table & Policies (For ECG / GWCL Automated Scraper)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL,
  target_district TEXT,
  target_neighborhood TEXT,
  severity TEXT DEFAULT 'medium',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Alerts are viewable by everyone" ON public.alerts;
CREATE POLICY "Alerts are viewable by everyone"
  ON public.alerts FOR SELECT
  USING (true);

-- Allow authenticated or backend service to insert alerts
-- Note: Using the SUPABASE_SERVICE_ROLE_KEY automatically bypasses RLS.
-- If you choose to use the anon key for scraping, uncomment the policy below:
-- DROP POLICY IF EXISTS "Allow anon script to insert alerts" ON public.alerts;
-- CREATE POLICY "Allow anon script to insert alerts" ON public.alerts FOR INSERT WITH CHECK (true);
