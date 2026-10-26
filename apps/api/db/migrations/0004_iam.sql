-- =============================================================================
-- 0004  Identity & Access Management (RBAC with company / branch scopes)
-- =============================================================================
CREATE TABLE iam.users (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  username        citext NOT NULL UNIQUE CHECK (length(username) BETWEEN 3 AND 64),
  email           citext NULL UNIQUE,
  full_name       text NOT NULL,
  password_hash   text NOT NULL,
  mfa_enabled     boolean NOT NULL DEFAULT false,
  mfa_secret_enc  text NULL,
  status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','LOCKED','DISABLED')),
  is_system_admin boolean NOT NULL DEFAULT false,   -- bypasses permission checks (setup owner only)
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until    timestamptz NULL,
  last_login_at   timestamptz NULL,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  must_change_password boolean NOT NULL DEFAULT false,
  employee_id     uuid NULL,                        -- FK added by HR migration
  preferred_locale text NOT NULL DEFAULT 'ar' CHECK (preferred_locale IN ('ar','en')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1
);

-- Permission catalogue = system metadata (code is the contract used by the API guards)
CREATE TABLE iam.permissions (
  code         text PRIMARY KEY CHECK (code ~ '^[a-z]+\.[a-z_]+\.[a-z_]+$'),
  module       text NOT NULL,
  resource     text NOT NULL,
  action       text NOT NULL CHECK (action IN ('view','create','edit','delete','approve','post','cancel',
                                               'close','reopen','export','print','view_sensitive')),
  is_sensitive boolean NOT NULL DEFAULT false,
  description_ar text NOT NULL,
  description_en text NOT NULL
);

CREATE TABLE iam.roles (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id  uuid NULL REFERENCES core.companies(id),   -- NULL = template role available to all companies
  code        text NOT NULL,
  name_ar     text NOT NULL,
  name_en     text NULL,
  description text NULL,
  is_system   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX ux_roles_code ON iam.roles
  (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

CREATE TABLE iam.role_permissions (
  role_id         uuid NOT NULL REFERENCES iam.roles(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES iam.permissions(code),
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE iam.user_role_assignments (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id     uuid NOT NULL REFERENCES iam.users(id),
  role_id     uuid NOT NULL REFERENCES iam.roles(id),
  company_id  uuid NOT NULL REFERENCES core.companies(id),
  branch_id   uuid NULL,                               -- NULL = all branches of the company
  valid_from  date NOT NULL DEFAULT current_date,
  valid_to    date NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  FOREIGN KEY (branch_id, company_id) REFERENCES core.branches(id, company_id),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE UNIQUE INDEX ux_ura ON iam.user_role_assignments
  (user_id, role_id, company_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Refresh tokens: only SHA-256 hashes are stored; rotation with reuse detection by family
CREATE TABLE iam.refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id      uuid NOT NULL REFERENCES iam.users(id),
  family_id    uuid NOT NULL,
  token_hash   text NOT NULL UNIQUE,
  ip           text NULL,
  user_agent   text NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz NULL,
  replaced_by  uuid NULL REFERENCES iam.refresh_tokens(id)
);
CREATE INDEX ix_refresh_family ON iam.refresh_tokens (family_id);

CREATE TABLE audit.security_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id     uuid NULL,
  username    text NULL,
  event_type  text NOT NULL CHECK (event_type IN ('LOGIN_SUCCESS','LOGIN_FAILED','LOGOUT','TOKEN_REFRESH',
                                                  'TOKEN_REUSE_DETECTED','ACCOUNT_LOCKED','PASSWORD_CHANGED',
                                                  'PERMISSION_DENIED','SETUP_COMPLETED')),
  ip          text NULL,
  user_agent  text NULL,
  details     jsonb NULL
);
CREATE INDEX ix_security_events_time ON audit.security_events (occurred_at DESC);
CREATE TRIGGER security_events_immutable BEFORE UPDATE OR DELETE ON audit.security_events
  FOR EACH ROW EXECUTE FUNCTION sys.trg_raise('AUDIT_LOG_IMMUTABLE');

CREATE TRIGGER touch BEFORE UPDATE ON iam.users FOR EACH ROW EXECUTE FUNCTION sys.trg_touch();
CREATE TRIGGER touch BEFORE UPDATE ON iam.roles FOR EACH ROW EXECUTE FUNCTION sys.trg_touch();
SELECT audit.enable('iam.users', 'password_hash', 'mfa_secret_enc');
SELECT audit.enable('iam.roles');
SELECT audit.enable('iam.role_permissions');
SELECT audit.enable('iam.user_role_assignments');

-- Effective permissions of a user inside a company (and optional branch)
CREATE OR REPLACE FUNCTION iam.user_permissions(p_user uuid, p_company uuid)
RETURNS TABLE (permission_code text, branch_id uuid) LANGUAGE sql STABLE AS $$
  SELECT DISTINCT rp.permission_code, ura.branch_id
    FROM iam.user_role_assignments ura
    JOIN iam.roles r ON r.id = ura.role_id
    JOIN iam.role_permissions rp ON rp.role_id = r.id
   WHERE ura.user_id = p_user AND ura.company_id = p_company
     AND (r.company_id IS NULL OR r.company_id = p_company)
     AND current_date >= ura.valid_from AND (ura.valid_to IS NULL OR current_date <= ura.valid_to)
$$;
