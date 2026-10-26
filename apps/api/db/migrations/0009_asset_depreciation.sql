-- =============================================================================
-- 0009  Asset depreciation runs + disposal
--   * A depreciation run posts, for one fiscal period, every scheduled month
--     not yet posted (catch-up) for every active asset, split by custody days
--     to the employee dimension so depreciation flows into employee cost and
--     profitability from the General Ledger.
--   * Runs are immutable; a run can only be CANCELLED (journal reversed).
-- =============================================================================

CREATE TABLE ast.depreciation_runs (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id         uuid NOT NULL REFERENCES core.companies(id),
  run_no             bigint GENERATED ALWAYS AS IDENTITY,
  fiscal_period_id   uuid NOT NULL,
  period_start       date NOT NULL,
  period_end         date NOT NULL,
  status             text NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','CANCELLED')),
  asset_count        int NOT NULL DEFAULT 0 CHECK (asset_count >= 0),
  total_amount_base  numeric(20,4) NOT NULL DEFAULT 0 CHECK (total_amount_base >= 0),
  journal_entry_id   uuid NULL REFERENCES acc.journal_entries(id),
  reversal_entry_id  uuid NULL REFERENCES acc.journal_entries(id),
  cancel_reason      text NULL,
  cancelled_at       timestamptz NULL,
  cancelled_by       uuid NULL REFERENCES iam.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (id, company_id),
  FOREIGN KEY (fiscal_period_id, company_id) REFERENCES core.fiscal_periods(id, company_id),
  CHECK (period_end >= period_start),
  CHECK (status <> 'CANCELLED' OR (cancel_reason IS NOT NULL AND length(trim(cancel_reason)) >= 3))
);
-- one effective run per period
CREATE UNIQUE INDEX ux_dep_runs_period ON ast.depreciation_runs (company_id, fiscal_period_id) WHERE status = 'POSTED';
CREATE INDEX ix_dep_runs_company ON ast.depreciation_runs (company_id, period_start DESC);

CREATE TABLE ast.depreciation_lines (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id           uuid NOT NULL,
  run_id               uuid NOT NULL,
  asset_id             uuid NOT NULL,
  employee_id          uuid NULL,
  month                date NOT NULL CHECK (extract(day FROM month) = 1),
  days                 int NOT NULL CHECK (days > 0),
  amount_base          numeric(20,4) NOT NULL CHECK (amount_base > 0),
  accumulated_base     numeric(20,4) NOT NULL CHECK (accumulated_base >= 0),
  net_book_value_base  numeric(20,4) NOT NULL CHECK (net_book_value_base >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (run_id, company_id)      REFERENCES ast.depreciation_runs(id, company_id),
  FOREIGN KEY (asset_id, company_id)    REFERENCES ast.assets(id, company_id),
  FOREIGN KEY (employee_id, company_id) REFERENCES hr.employees(id, company_id)
);
CREATE INDEX ix_dep_lines_run   ON ast.depreciation_lines (run_id);
CREATE INDEX ix_dep_lines_asset ON ast.depreciation_lines (asset_id, month);
CREATE INDEX ix_dep_lines_emp   ON ast.depreciation_lines (company_id, employee_id, month) WHERE employee_id IS NOT NULL;

-- Disposal attributes (not part of the frozen acquisition financials)
ALTER TABLE ast.assets
  ADD COLUMN disposal_entry_id     uuid NULL REFERENCES acc.journal_entries(id),
  ADD COLUMN disposal_proceeds_base numeric(20,4) NULL CHECK (disposal_proceeds_base IS NULL OR disposal_proceeds_base >= 0),
  ADD COLUMN disposal_reason       text NULL;

-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ast.trg_dep_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DEPRECIATION_RUN_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'DEPRECIATION_RUN_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  -- financial content is frozen once the journal is attached; only cancellation is allowed
  IF OLD.journal_entry_id IS NOT NULL AND (
       NEW.fiscal_period_id IS DISTINCT FROM OLD.fiscal_period_id
    OR NEW.total_amount_base IS DISTINCT FROM OLD.total_amount_base
    OR NEW.asset_count IS DISTINCT FROM OLD.asset_count
    OR NEW.journal_entry_id IS DISTINCT FROM OLD.journal_entry_id) THEN
    RAISE EXCEPTION 'DEPRECIATION_RUN_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a_dep_run_guard BEFORE UPDATE OR DELETE ON ast.depreciation_runs
  FOR EACH ROW EXECUTE FUNCTION ast.trg_dep_run_guard();

CREATE OR REPLACE FUNCTION ast.trg_dep_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DEPRECIATION_RUN_IMMUTABLE' USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER a_dep_line_guard BEFORE UPDATE OR DELETE ON ast.depreciation_lines
  FOR EACH ROW EXECUTE FUNCTION ast.trg_dep_line_guard();

CREATE TRIGGER touch BEFORE UPDATE ON ast.depreciation_runs FOR EACH ROW EXECUTE FUNCTION sys.trg_touch();
SELECT audit.enable('ast.depreciation_runs');
