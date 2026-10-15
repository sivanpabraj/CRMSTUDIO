-- CRMSTUDIO Multi-Tenant Schema Hardening v2
-- Fixes: Composite Foreign Keys, Tenant Isolation, Indexes, Row Locks & Idempotency

-- 1. Ensure composite unique keys for multi-tenant references
ALTER TABLE banks ADD CONSTRAINT uq_banks_studio_id UNIQUE (studio_id, id);
ALTER TABLE contracts ADD CONSTRAINT uq_contracts_studio_id UNIQUE (studio_id, id);
ALTER TABLE personnel ADD CONSTRAINT uq_personnel_studio_id UNIQUE (studio_id, id);

-- 2. Harden transactions: enforce tenant isolation and personnel FK
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_bank_id_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_contract_id_fkey;

ALTER TABLE transactions
  ADD CONSTRAINT fk_tx_studio_bank FOREIGN KEY (studio_id, bank_id) 
    REFERENCES banks(studio_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_tx_studio_contract FOREIGN KEY (studio_id, contract_id) 
    REFERENCES contracts(studio_id, id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_tx_studio_personnel FOREIGN KEY (studio_id, personnel_id) 
    REFERENCES personnel(studio_id, id) ON DELETE SET NULL,
  ADD CONSTRAINT chk_tx_amount_positive CHECK (amount > 0);

-- 3. Harden pers_projects: enforce tenant isolation
ALTER TABLE pers_projects DROP CONSTRAINT IF EXISTS pers_projects_contract_id_fkey;
ALTER TABLE pers_projects DROP CONSTRAINT IF EXISTS pers_projects_personnel_id_fkey;

ALTER TABLE pers_projects
  ADD CONSTRAINT fk_pers_proj_contract FOREIGN KEY (studio_id, contract_id) 
    REFERENCES contracts(studio_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_pers_proj_personnel FOREIGN KEY (studio_id, personnel_id) 
    REFERENCES personnel(studio_id, id) ON DELETE CASCADE;

-- 4. High-performance multi-tenant indexes
CREATE INDEX IF NOT EXISTS idx_contracts_studio_created ON contracts (studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_studio_num ON contracts (studio_id, contract_num);
CREATE INDEX IF NOT EXISTS idx_banks_studio_created ON banks (studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_studio_bank ON transactions (studio_id, bank_id);
CREATE INDEX IF NOT EXISTS idx_tx_studio_personnel ON transactions (studio_id, personnel_id);
CREATE INDEX IF NOT EXISTS idx_pers_proj_contract ON pers_projects (studio_id, contract_id);
CREATE INDEX IF NOT EXISTS idx_personnel_studio_created ON personnel (studio_id, created_at DESC);

-- 5. Add updated_at to banks, personnel, and pers_projects
ALTER TABLE banks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE pers_projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_banks_updated ON banks;
CREATE TRIGGER trg_banks_updated BEFORE UPDATE ON banks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_personnel_updated ON personnel;
CREATE TRIGGER trg_personnel_updated BEFORE UPDATE ON personnel
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pers_projects_updated ON pers_projects;
CREATE TRIGGER trg_pers_projects_updated BEFORE UPDATE ON pers_projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. Persistent DB Idempotency Key Store
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key         TEXT PRIMARY KEY,
  studio_id   UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  response    JSONB NOT NULL,
  status_code INT NOT NULL DEFAULT 200,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_idem_studio_created ON idempotency_keys (studio_id, created_at);
