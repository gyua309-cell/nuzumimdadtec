-- =============================================================================
-- 0001  Extensions, schemas, system helpers
-- IDHAM HR ACCOUNTING ERP
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS sys;    -- system configuration & infrastructure
CREATE SCHEMA IF NOT EXISTS audit;  -- append-only audit trail
CREATE SCHEMA IF NOT EXISTS core;   -- organization, currencies, fiscal calendar, taxes
CREATE SCHEMA IF NOT EXISTS iam;    -- identity & access
CREATE SCHEMA IF NOT EXISTS acc;    -- accounting engine
CREATE SCHEMA IF NOT EXISTS hr;     -- human resources & cost setup
CREATE SCHEMA IF NOT EXISTS prj;    -- clients, projects, assignments, pricing
CREATE SCHEMA IF NOT EXISTS pay;    -- payroll, variables, loans
CREATE SCHEMA IF NOT EXISTS ast;    -- assets & depreciation
CREATE SCHEMA IF NOT EXISTS rev;    -- revenue & receivables
CREATE SCHEMA IF NOT EXISTS exp;    -- expenses & payables
CREATE SCHEMA IF NOT EXISTS cst;    -- period runs, allocation, overhead, profitability
CREATE SCHEMA IF NOT EXISTS wf;     -- approvals & adjustments
CREATE SCHEMA IF NOT EXISTS rpt;    -- snapshots & report exports

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------

-- Raise a fixed error code (used by WHEN-guarded triggers)
CREATE OR REPLACE FUNCTION sys.trg_raise() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%', TG_ARGV[0] USING ERRCODE = 'P0001';
END $$;

-- Maintain updated_at / row_version and updated_by from the request context
CREATE OR REPLACE FUNCTION sys.trg_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.row_version := COALESCE(OLD.row_version, 0) + 1;
  IF NULLIF(current_setting('app.user_id', true), '') IS NOT NULL THEN
    NEW.updated_by := current_setting('app.user_id', true)::uuid;
  END IF;
  RETURN NEW;
END $$;

-- Current user from the transaction-local context (set by the API Unit of Work)
CREATE OR REPLACE FUNCTION sys.current_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- System tables
-- ---------------------------------------------------------------------------
CREATE TABLE sys.settings (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id  uuid NULL,                       -- NULL = system-wide
  section     text NOT NULL,
  key         text NOT NULL,
  value       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NULL,
  row_version int NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX ux_settings_scope ON sys.settings
  (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), section, key);
CREATE TRIGGER settings_touch BEFORE UPDATE ON sys.settings FOR EACH ROW EXECUTE FUNCTION sys.trg_touch();

-- Gapless document numbering (row-locked inside the posting transaction)
CREATE TABLE sys.number_sequences (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id    uuid NOT NULL,
  doc_type      text NOT NULL,
  scope_key     text NOT NULL DEFAULT '',      -- e.g. fiscal year code
  prefix        text NOT NULL DEFAULT '',
  padding       int  NOT NULL DEFAULT 6 CHECK (padding BETWEEN 1 AND 12),
  next_value    bigint NOT NULL DEFAULT 1 CHECK (next_value > 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_type, scope_key)
);

-- Transactional outbox for domain events
CREATE TABLE sys.outbox_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  company_id    uuid NULL,
  event_type    text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id  text NOT NULL,
  payload       jsonb NOT NULL,
  processed_at  timestamptz NULL,
  attempts      int NOT NULL DEFAULT 0,
  last_error    text NULL
);
CREATE INDEX ix_outbox_pending ON sys.outbox_events (occurred_at) WHERE processed_at IS NULL;

-- Errors of failed business transactions (written OUTSIDE the rolled-back transaction)
CREATE TABLE sys.error_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  request_id    text NULL,
  user_id       uuid NULL,
  company_id    uuid NULL,
  operation     text NOT NULL,
  error_code    text NULL,
  message       text NOT NULL,
  details       jsonb NULL
);

CREATE TABLE sys.notifications (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id     uuid NOT NULL,
  company_id  uuid NULL,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NULL,
  link        text NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz NULL
);
CREATE INDEX ix_notifications_user ON sys.notifications (user_id, created_at DESC);
