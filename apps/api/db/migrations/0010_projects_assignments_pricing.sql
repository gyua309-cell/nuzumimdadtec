-- =============================================================================
-- 0010  Clients, projects (client required), employee assignments, service prices
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
CREATE TABLE prj.clients (
  id                    uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id            uuid NOT NULL REFERENCES core.companies(id),
  code                  text NOT NULL,
  name_ar               text NOT NULL,
  name_en               text NULL,
  tax_registration_no   text NULL,
  contact_person        text NULL,
  email                 citext NULL,
  phone                 text NULL,
  address               text NULL,
  currency_code         char(3) NOT NULL REFERENCES core.currencies(code),
  payment_terms_days    int NOT NULL DEFAULT 30 CHECK (payment_terms_days BETWEEN 0 AND 365),
  receivable_account_id uuid NULL,
  default_tax_code_id   uuid NULL REFERENCES core.tax_codes(id),
  is_active             boolean NOT NULL DEFAULT true,
  notes                 text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code),
  UNIQUE (id, company_id),
  FOREIGN KEY (receivable_account_id, company_id) REFERENCES acc.accounts(id, company_id)
);
CREATE INDEX ix_clients_name ON prj.clients USING gin (name_ar gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Projects: a project cannot exist without a client (NOT NULL composite FK)
-- ---------------------------------------------------------------------------
CREATE TABLE prj.projects (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id           uuid NOT NULL REFERENCES core.companies(id),
  client_id            uuid NOT NULL,
  code                 text NOT NULL,
  name_ar              text NOT NULL,
  name_en              text NULL,
  status               text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ON_HOLD','COMPLETED','CANCELLED')),
  start_date           date NOT NULL,
  end_date             date NULL,
  manager_employee_id  uuid NULL,
  currency_code        char(3) NOT NULL REFERENCES core.currencies(code),
  required_margin_pct  numeric(9,4) NULL CHECK (required_margin_pct IS NULL OR required_margin_pct BETWEEN -100 AND 1000),
  branch_id            uuid NULL,
  cost_center_id       uuid NULL,
  revenue_account_id   uuid NULL,
  description          text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code),
  UNIQUE (id, company_id),
  FOREIGN KEY (client_id, company_id)           REFERENCES prj.clients(id, company_id),
  FOREIGN KEY (manager_employee_id, company_id) REFERENCES hr.employees(id, company_id),
  FOREIGN KEY (branch_id, company_id)           REFERENCES core.branches(id, company_id),
  FOREIGN KEY (cost_center_id, company_id)      REFERENCES core.cost_centers(id, company_id),
  FOREIGN KEY (revenue_account_id, company_id)  REFERENCES acc.accounts(id, company_id),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX ix_projects_client ON prj.projects (company_id, client_id);
CREATE INDEX ix_projects_status ON prj.projects (company_id, status);

CREATE TABLE prj.project_status_history (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id     uuid NOT NULL,
  project_id     uuid NOT NULL,
  old_status     text NULL,
  new_status     text NOT NULL,
  effective_date date NOT NULL,
  reason         text NOT NULL,
  changed_by     uuid NULL,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, company_id) REFERENCES prj.projects(id, company_id)
);
CREATE TRIGGER a_project_status_history_immutable BEFORE UPDATE OR DELETE ON prj.project_status_history
  FOR EACH ROW EXECUTE FUNCTION sys.trg_raise('HISTORY_IMMUTABLE');

-- ---------------------------------------------------------------------------
-- Assignments: Employee + Project + Allocation % + dates.
-- An employee may work on many projects at once; the SUM of allocations across
-- projects is NOT constrained (over-allocation is a warning, not an error), but
-- the same employee/project pair can never overlap itself.
-- ---------------------------------------------------------------------------
CREATE TABLE prj.assignments (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id     uuid NOT NULL,
  employee_id    uuid NOT NULL,
  project_id     uuid NOT NULL,
  allocation_pct numeric(9,4) NOT NULL CHECK (allocation_pct > 0 AND allocation_pct <= 100),
  role_title     text NULL,
  is_billable    boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  effective_to   date NULL,
  change_reason  text NULL,
  notes          text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (id, company_id),
  FOREIGN KEY (employee_id, company_id) REFERENCES hr.employees(id, company_id),
  FOREIGN KEY (project_id, company_id)  REFERENCES prj.projects(id, company_id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  EXCLUDE USING gist (employee_id WITH =, project_id WITH =, daterange(effective_from, effective_to, '[]') WITH &&)
);
CREATE INDEX ix_assignments_employee ON prj.assignments (company_id, employee_id, effective_from);
CREATE INDEX ix_assignments_project  ON prj.assignments (company_id, project_id, effective_from);

-- ---------------------------------------------------------------------------
-- Service prices: employee default (project_id NULL) and project override.
-- ---------------------------------------------------------------------------
CREATE TABLE prj.service_prices (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id     uuid NOT NULL,
  employee_id    uuid NOT NULL,
  project_id     uuid NULL,
  pricing_basis  text NOT NULL CHECK (pricing_basis IN ('MONTHLY','DAILY','HOURLY')),
  price          numeric(20,4) NOT NULL CHECK (price >= 0),
  currency_code  char(3) NOT NULL REFERENCES core.currencies(code),
  effective_from date NOT NULL,
  effective_to   date NULL,
  reason         text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (id, company_id),
  FOREIGN KEY (employee_id, company_id) REFERENCES hr.employees(id, company_id),
  FOREIGN KEY (project_id, company_id)  REFERENCES prj.projects(id, company_id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  EXCLUDE USING gist (employee_id WITH =, (COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
                      daterange(effective_from, effective_to, '[]') WITH &&)
);
CREATE INDEX ix_prices_lookup ON prj.service_prices (company_id, employee_id, project_id, effective_from);

-- ---------------------------------------------------------------------------
-- Triggers & audit
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['prj.clients','prj.projects','prj.assignments','prj.service_prices'] LOOP
    EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION sys.trg_touch()', t);
  END LOOP;
END $$;

SELECT audit.enable('prj.clients');
SELECT audit.enable('prj.projects');
SELECT audit.enable('prj.project_status_history');
SELECT audit.enable('prj.assignments');
SELECT audit.enable('prj.service_prices');
