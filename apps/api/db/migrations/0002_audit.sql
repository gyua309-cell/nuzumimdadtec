-- =============================================================================
-- 0002  Central Audit Trail (append-only, partitioned, tamper-evident row hash)
-- =============================================================================
CREATE TABLE audit.audit_log (
  id             bigint GENERATED ALWAYS AS IDENTITY,
  occurred_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  user_id        uuid NULL,
  company_id     uuid NULL,
  ip             text NULL,
  device         text NULL,
  request_id     text NULL,
  schema_name    text NOT NULL,
  table_name     text NOT NULL,
  entity_id      text NOT NULL,
  action         text NOT NULL,   -- INSERT/UPDATE/DELETE or business verbs: POST, REVERSE, APPROVE, REJECT, CLOSE, REOPEN, LOGIN...
  old_values     jsonb NULL,
  new_values     jsonb NULL,
  changed_fields text[] NULL,
  reason         text NULL,
  reference      text NULL,
  row_hash       text NOT NULL,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

-- Default partition guarantees inserts never fail; monthly partitions are created by
-- audit.ensure_partitions() (called by migrations and the maintenance job).
CREATE TABLE audit.audit_log_default PARTITION OF audit.audit_log DEFAULT;

CREATE INDEX ix_audit_entity ON audit.audit_log (table_name, entity_id, occurred_at DESC);
CREATE INDEX ix_audit_user   ON audit.audit_log (user_id, occurred_at DESC);
CREATE INDEX ix_audit_company_time ON audit.audit_log (company_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION audit.ensure_partitions(p_months_ahead int DEFAULT 3) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  m date := date_trunc('month', now())::date;
  i int;
  part text;
BEGIN
  FOR i IN 0..p_months_ahead LOOP
    part := format('audit_log_%s', to_char(m + make_interval(months => i), 'YYYYMM'));
    IF to_regclass('audit.' || part) IS NULL THEN
      EXECUTE format('CREATE TABLE audit.%I PARTITION OF audit.audit_log FOR VALUES FROM (%L) TO (%L)',
                     part, m + make_interval(months => i), m + make_interval(months => i + 1));
    END IF;
  END LOOP;
END $$;
SELECT audit.ensure_partitions(3);

-- Row hash computed in the DB so it cannot be bypassed by the application
CREATE OR REPLACE FUNCTION audit.trg_hash() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.row_hash := encode(digest(
      concat_ws('|', NEW.occurred_at::text, NEW.user_id::text, NEW.schema_name, NEW.table_name,
                NEW.entity_id, NEW.action, NEW.old_values::text, NEW.new_values::text, NEW.reason),
      'sha256'), 'hex');
  RETURN NEW;
END $$;
CREATE TRIGGER audit_hash BEFORE INSERT ON audit.audit_log FOR EACH ROW EXECUTE FUNCTION audit.trg_hash();

-- Append-only: no UPDATE / DELETE ever
CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION sys.trg_raise('AUDIT_LOG_IMMUTABLE');

-- Generic row-level audit trigger. Context comes from transaction-local settings
-- set by the API Unit of Work: app.user_id, app.company_id, app.ip, app.device,
-- app.request_id, app.reason. Sensitive columns listed in TG_ARGV are masked.
CREATE OR REPLACE FUNCTION audit.trg_row_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_changed text[];
  v_col text;
BEGIN
  -- mask sensitive columns (never store secrets in the audit trail)
  IF TG_NARGS > 0 THEN
    FOREACH v_col IN ARRAY TG_ARGV LOOP
      IF v_old ? v_col THEN v_old := jsonb_set(v_old, ARRAY[v_col], '"***"'); END IF;
      IF v_new ? v_col THEN v_new := jsonb_set(v_new, ARRAY[v_col], '"***"'); END IF;
    END LOOP;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(k) INTO v_changed
      FROM jsonb_object_keys(v_new) AS k
     WHERE v_new -> k IS DISTINCT FROM v_old -> k
       AND k NOT IN ('updated_at', 'row_version', 'updated_by');
    IF v_changed IS NULL THEN
      RETURN NEW;   -- nothing meaningful changed
    END IF;
  END IF;

  INSERT INTO audit.audit_log(user_id, company_id, ip, device, request_id, schema_name, table_name,
                              entity_id, action, old_values, new_values, changed_fields, reason, row_hash)
  VALUES (NULLIF(current_setting('app.user_id', true), '')::uuid,
          NULLIF(current_setting('app.company_id', true), '')::uuid,
          NULLIF(current_setting('app.ip', true), ''),
          NULLIF(current_setting('app.device', true), ''),
          NULLIF(current_setting('app.request_id', true), ''),
          TG_TABLE_SCHEMA, TG_TABLE_NAME,
          COALESCE(v_new ->> 'id', v_old ->> 'id', v_new ->> 'code', v_old ->> 'code', '?'),
          TG_OP, v_old, v_new, v_changed,
          NULLIF(current_setting('app.reason', true), ''), '');
  RETURN COALESCE(NEW, OLD);
END $$;

-- Business-level audit entries (POST, CLOSE, REOPEN, LOGIN ...) written by the API
CREATE OR REPLACE FUNCTION audit.log_action(
  p_schema text, p_table text, p_entity_id text, p_action text,
  p_old jsonb, p_new jsonb, p_reason text, p_reference text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO audit.audit_log(user_id, company_id, ip, device, request_id, schema_name, table_name,
                              entity_id, action, old_values, new_values, reason, reference, row_hash)
  VALUES (NULLIF(current_setting('app.user_id', true), '')::uuid,
          NULLIF(current_setting('app.company_id', true), '')::uuid,
          NULLIF(current_setting('app.ip', true), ''),
          NULLIF(current_setting('app.device', true), ''),
          NULLIF(current_setting('app.request_id', true), ''),
          p_schema, p_table, p_entity_id, p_action, p_old, p_new,
          COALESCE(p_reason, NULLIF(current_setting('app.reason', true), '')), p_reference, '');
$$;

-- Helper used by later migrations: attach the audit trigger to a table
CREATE OR REPLACE FUNCTION audit.enable(p_table regclass, VARIADIC p_masked text[] DEFAULT ARRAY[]::text[])
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS zz_audit ON %s', p_table);
  IF array_length(p_masked, 1) IS NULL THEN
    EXECUTE format('CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON %s
                    FOR EACH ROW EXECUTE FUNCTION audit.trg_row_audit()', p_table);
  ELSE
    EXECUTE format('CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON %s
                    FOR EACH ROW EXECUTE FUNCTION audit.trg_row_audit(%s)', p_table,
                   (SELECT string_agg(quote_literal(c), ',') FROM unnest(p_masked) c));
  END IF;
END $$;

SELECT audit.enable('sys.settings');
