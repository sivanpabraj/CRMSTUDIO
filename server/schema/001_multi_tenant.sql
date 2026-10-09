-- CRMSTUDIO Multi-Tenant Schema v1
-- PostgreSQL 14+
-- هدف: هزاران استودیو · هزاران کاربر

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ═══════════════════════════════════════════
-- ستون ۱–۲: Tenant + Identity
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS studios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  name_en       TEXT,
  plan          TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','business','enterprise')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','pending','deleted')),
  phone         TEXT,
  email         CITEXT,
  settings      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT UNIQUE,
  email           CITEXT UNIQUE,
  password_hash   TEXT,
  password_salt   TEXT,
  name            TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','disabled')),
  must_change_pw  BOOLEAN NOT NULL DEFAULT false,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_phone_or_email CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  studio_id   UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'staff',
  roles       JSONB NOT NULL DEFAULT '[]'::jsonb,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','revoked')),
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, studio_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_studio ON memberships (studio_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  purpose     TEXT NOT NULL DEFAULT 'login',
  attempts    INT NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes (phone, purpose);

CREATE TABLE IF NOT EXISTS invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id   UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'staff',
  phone       TEXT,
  expires_at  TIMESTAMPTZ,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (studio_id, code)
);

-- ═══════════════════════════════════════════
-- دامنه: همه با studio_id
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contracts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id     UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  contract_num  TEXT,
  bride         TEXT,
  groom         TEXT,
  couple        TEXT,
  phone         TEXT,
  bride_phone   TEXT,
  groom_phone   TEXT,
  event_date    TEXT,
  total_price   BIGINT NOT NULL DEFAULT 0,
  paid_amount   BIGINT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_studio ON contracts (studio_id);
CREATE INDEX IF NOT EXISTS idx_contracts_studio_event ON contracts (studio_id, event_date);
CREATE INDEX IF NOT EXISTS idx_contracts_studio_phone ON contracts (studio_id, phone);

CREATE TABLE IF NOT EXISTS banks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id   UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name        TEXT,
  bank_name   TEXT,
  account     TEXT,
  card        TEXT,
  iban        TEXT,
  balance     BIGINT NOT NULL DEFAULT 0,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banks_studio ON banks (studio_id);

CREATE TABLE IF NOT EXISTS transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id         UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  type              TEXT NOT NULL CHECK (type IN ('deposit','withdrawal')),
  amount            BIGINT NOT NULL,
  date_jalali       TEXT,
  bank_id           UUID REFERENCES banks(id) ON DELETE SET NULL,
  contract_id       UUID REFERENCES contracts(id) ON DELETE SET NULL,
  personnel_id      UUID,
  purpose_category  TEXT,
  purpose           TEXT,
  client_name       TEXT,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tx_studio ON transactions (studio_id);
CREATE INDEX IF NOT EXISTS idx_tx_studio_date ON transactions (studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_contract ON transactions (studio_id, contract_id);

CREATE TABLE IF NOT EXISTS personnel (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id   UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  phone       TEXT,
  roles       JSONB NOT NULL DEFAULT '[]'::jsonb,
  status      TEXT NOT NULL DEFAULT 'active',
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personnel_studio ON personnel (studio_id);
CREATE INDEX IF NOT EXISTS idx_personnel_phone ON personnel (studio_id, phone);

CREATE TABLE IF NOT EXISTS pers_projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id     UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  contract_id   UUID REFERENCES contracts(id) ON DELETE CASCADE,
  personnel_id  UUID REFERENCES personnel(id) ON DELETE CASCADE,
  role_id       TEXT,
  accepted      BOOLEAN DEFAULT false,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pers_proj_studio ON pers_projects (studio_id);
CREATE INDEX IF NOT EXISTS idx_pers_proj_person ON pers_projects (studio_id, personnel_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  studio_id   UUID,
  user_id     UUID,
  action      TEXT NOT NULL,
  detail      TEXT,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_studio ON audit_logs (studio_id, created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_studios_updated ON studios;
CREATE TRIGGER trg_studios_updated BEFORE UPDATE ON studios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_contracts_updated ON contracts;
CREATE TRIGGER trg_contracts_updated BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
