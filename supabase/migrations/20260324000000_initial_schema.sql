-- ============================================================
-- TributoFlow — Migration 1: Initial Schema
-- offices, profiles, user_roles, feature_permissions
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum types
CREATE TYPE app_role AS ENUM ('office_owner', 'office_staff', 'company_user');
CREATE TYPE feature_key AS ENUM (
  'clients', 'items', 'ncm_diagnostics', 'classification',
  'price_simulation', 'reports', 'audit_trail', 'integrations',
  'users', 'settings', 'api_access', 'rag_assistant'
);
CREATE TYPE tax_regime AS ENUM ('simples', 'lucro_presumido', 'lucro_real', 'mei');
CREATE TYPE item_status AS ENUM ('pending', 'in_review', 'classified');
CREATE TYPE item_type AS ENUM ('goods', 'services');
CREATE TYPE classification_status AS ENUM ('draft', 'approved', 'archived');
CREATE TYPE audit_action AS ENUM ('create', 'update', 'delete', 'approve');

-- ---------------------------------------------------------------
-- offices
-- ---------------------------------------------------------------
CREATE TABLE offices (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cnpj        TEXT,
  logo_url    TEXT,
  plan        TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- profiles (extends auth.users 1:1)
-- ---------------------------------------------------------------
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  office_id   UUID REFERENCES offices(id) ON DELETE SET NULL,
  full_name   TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------
CREATE TABLE user_roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  office_id   UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  role        app_role NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, office_id, role)
);

-- ---------------------------------------------------------------
-- feature_permissions
-- ---------------------------------------------------------------
CREATE TABLE feature_permissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  office_id   UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  role        app_role NOT NULL,
  feature_key feature_key NOT NULL,
  can_read    BOOLEAN NOT NULL DEFAULT true,
  can_write   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(office_id, role, feature_key)
);

-- ---------------------------------------------------------------
-- client_companies
-- ---------------------------------------------------------------
CREATE TABLE client_companies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  office_id     UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  cnpj          TEXT NOT NULL,
  legal_name    TEXT NOT NULL,
  trade_name    TEXT,
  tax_regime    tax_regime NOT NULL DEFAULT 'lucro_presumido',
  main_cnae     TEXT,
  sector_flags  JSONB NOT NULL DEFAULT '{}',
  contact_name  TEXT,
  contact_email TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(office_id, cnpj)
);

-- ---------------------------------------------------------------
-- Auto-create profile on signup
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------
-- get_my_office_id() helper
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_office_id()
RETURNS UUID
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT office_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ---------------------------------------------------------------
-- setup_new_office() RPC
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.setup_new_office(
  name TEXT,
  slug TEXT,
  cnpj TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_office_id UUID;
BEGIN
  INSERT INTO public.offices (name, slug, cnpj, owner_id)
  VALUES (name, slug, cnpj, auth.uid())
  RETURNING id INTO v_office_id;

  UPDATE public.profiles SET office_id = v_office_id WHERE id = auth.uid();

  INSERT INTO public.user_roles (user_id, office_id, role)
  VALUES (auth.uid(), v_office_id, 'office_owner');

  -- Default feature permissions for office_owner (full access)
  INSERT INTO public.feature_permissions (office_id, role, feature_key, can_read, can_write)
  SELECT v_office_id, 'office_owner', fk, true, true
  FROM unnest(ARRAY[
    'clients', 'items', 'ncm_diagnostics', 'classification',
    'price_simulation', 'reports', 'audit_trail', 'integrations',
    'users', 'settings', 'api_access', 'rag_assistant'
  ]::feature_key[]) fk
  ON CONFLICT DO NOTHING;

  -- office_staff default permissions (read + write, no users/settings)
  INSERT INTO public.feature_permissions (office_id, role, feature_key, can_read, can_write)
  SELECT v_office_id, 'office_staff', fk, true, true
  FROM unnest(ARRAY[
    'clients', 'items', 'ncm_diagnostics', 'classification',
    'price_simulation', 'reports', 'audit_trail'
  ]::feature_key[]) fk
  ON CONFLICT DO NOTHING;

  -- company_user (read-only portal)
  INSERT INTO public.feature_permissions (office_id, role, feature_key, can_read, can_write)
  SELECT v_office_id, 'company_user', fk, true, false
  FROM unnest(ARRAY['items', 'price_simulation', 'reports']::feature_key[]) fk
  ON CONFLICT DO NOTHING;

  RETURN v_office_id;
END;
$$;

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
ALTER TABLE offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_companies ENABLE ROW LEVEL SECURITY;

-- offices: owner and members can read; only owner can update
CREATE POLICY "offices_read" ON offices FOR SELECT
  USING (id = get_my_office_id());

CREATE POLICY "offices_update" ON offices FOR UPDATE
  USING (owner_id = auth.uid());

-- profiles: users see their own; office members see each other
CREATE POLICY "profiles_own" ON profiles FOR ALL
  USING (id = auth.uid());

CREATE POLICY "profiles_office" ON profiles FOR SELECT
  USING (office_id = get_my_office_id());

-- user_roles: read own office
CREATE POLICY "user_roles_read" ON user_roles FOR SELECT
  USING (office_id = get_my_office_id());

-- feature_permissions: read own office
CREATE POLICY "feature_perms_read" ON feature_permissions FOR SELECT
  USING (office_id = get_my_office_id());

-- client_companies: isolated by office
CREATE POLICY "companies_tenant" ON client_companies FOR ALL
  USING (office_id = get_my_office_id())
  WITH CHECK (office_id = get_my_office_id());
