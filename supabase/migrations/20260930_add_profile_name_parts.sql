ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_names TEXT,
  ADD COLUMN IF NOT EXISTS surnames TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id, full_name, first_names, surnames, email, rut, phone, gender, birth_date,
    role, owner_terms_accepted, verification_status, created_at, updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'first_names', ''),
    COALESCE(NEW.raw_user_meta_data->>'surnames', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'rut', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'gender', 'prefiero_no_decir'),
    NULLIF(NEW.raw_user_meta_data->>'birth_date', '')::DATE,
    COALESCE(NEW.raw_user_meta_data->>'role', 'tenant'),
    COALESCE((NEW.raw_user_meta_data->>'owner_terms_accepted')::boolean, false),
    COALESCE(NEW.raw_user_meta_data->>'verification_status', 'unverified'),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    first_names = EXCLUDED.first_names,
    surnames = EXCLUDED.surnames,
    email = EXCLUDED.email,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
