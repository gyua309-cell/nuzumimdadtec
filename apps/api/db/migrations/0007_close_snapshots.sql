-- =============================================================================
-- 0007  Period-close snapshots (append-only, hashed) + API idempotency keys
-- =============================================================================

-- Immutable historical snapshot taken at every period close (re-closing after a
-- reopen creates a new version; older versions are kept for comparison).
CREATE TABLE rpt.period_snapshots (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id   uuid NOT NULL REFERENCES core.companies(id),
  period_id    uuid NOT NULL,
  version      int  NOT NULL CHECK (version > 0),
  kind         text NOT NULL DEFAULT 'PERIOD_CLOSE' CHECK (kind IN ('PERIOD_CLOSE','YEAR_CLOSE')),
  data         jsonb NOT NULL,
  data_hash    text NOT NULL,
  reason       text NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NULL,
  UNIQUE (period_id, version),
  FOREIGN KEY (period_id, company_id) REFERENCES core.fiscal_periods(id, company_id)
);
CREATE INDEX ix_snapshots_company ON rpt.period_snapshots (company_id, period_id, version DESC);

-- hash computed inside the database so it cannot be forged by the application
CREATE OR REPLACE FUNCTION rpt.trg_snapshot_hash() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.data_hash := encode(digest(NEW.data::text, 'sha256'), 'hex');
  RETURN NEW;
END $$;
CREATE TRIGGER a_snapshot_hash BEFORE INSERT ON rpt.period_snapshots
  FOR EACH ROW EXECUTE FUNCTION rpt.trg_snapshot_hash();
CREATE TRIGGER b_snapshot_immutable BEFORE UPDATE OR DELETE ON rpt.period_snapshots
  FOR EACH ROW EXECUTE FUNCTION sys.trg_raise('SNAPSHOT_IMMUTABLE');
SELECT audit.enable('rpt.period_snapshots');

-- Idempotency for state-changing API calls (Idempotency-Key header)
CREATE TABLE sys.idempotency_keys (
  company_id    uuid NOT NULL,
  user_id       uuid NOT NULL,
  key           text NOT NULL CHECK (length(key) BETWEEN 8 AND 128),
  request_hash  text NOT NULL,
  status_code   int  NULL,
  response      jsonb NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id, key)
);

-- Only one active rounding account may exist per company (used by the posting engine)
CREATE UNIQUE INDEX ux_accounts_rounding ON acc.accounts (company_id)
  WHERE subtype = 'ROUNDING' AND is_active AND is_posting;
