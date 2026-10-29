-- =============================================================================
-- 0021  Foreign Key Performance Indexes
-- IDHAM HR ACCOUNTING ERP
-- Optimized for high-concurrency reporting and join performance
-- =============================================================================

-- Accounting & Ledger
CREATE INDEX IF NOT EXISTS ix_journal_lines_entry_id ON acc.journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS ix_journal_lines_account_id ON acc.journal_lines(account_id);
CREATE INDEX IF NOT EXISTS ix_journal_lines_branch_id ON acc.journal_lines(branch_id);
CREATE INDEX IF NOT EXISTS ix_journal_lines_project_id ON acc.journal_lines(project_id);
CREATE INDEX IF NOT EXISTS ix_journal_lines_client_id ON acc.journal_lines(client_id);
CREATE INDEX IF NOT EXISTS ix_journal_lines_employee_id ON acc.journal_lines(employee_id);
CREATE INDEX IF NOT EXISTS ix_journal_lines_currency_code ON acc.journal_lines(currency_code);
CREATE INDEX IF NOT EXISTS ix_journal_entries_period_id ON acc.journal_entries(fiscal_period_id);
CREATE INDEX IF NOT EXISTS ix_journal_entries_company_status ON acc.journal_entries(company_id, status);

-- Sales & Billing
CREATE INDEX IF NOT EXISTS ix_invoices_client_id ON sal.invoices(client_id);
CREATE INDEX IF NOT EXISTS ix_invoices_project_id ON sal.invoices(project_id);
CREATE INDEX IF NOT EXISTS ix_invoices_period_id ON sal.invoices(fiscal_period_id);
CREATE INDEX IF NOT EXISTS ix_invoices_branch_id ON sal.invoices(branch_id);
CREATE INDEX IF NOT EXISTS ix_invoice_lines_invoice_id ON sal.invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS ix_invoice_lines_employee_id ON sal.invoice_lines(employee_id);

-- Projects & Staff Augmentation
CREATE INDEX IF NOT EXISTS ix_projects_client_id ON prj.projects(client_id);
CREATE INDEX IF NOT EXISTS ix_projects_branch_id ON prj.projects(branch_id);
CREATE INDEX IF NOT EXISTS ix_assignments_project_id ON prj.assignments(project_id);
CREATE INDEX IF NOT EXISTS ix_assignments_employee_id ON prj.assignments(employee_id);
CREATE INDEX IF NOT EXISTS ix_assignments_period_id ON prj.assignments(fiscal_period_id);

-- HR & Placement
CREATE INDEX IF NOT EXISTS ix_employees_branch_id ON hr.employees(branch_id);
CREATE INDEX IF NOT EXISTS ix_employees_department_id ON hr.employees(department_id);
CREATE INDEX IF NOT EXISTS ix_employees_position_id ON hr.employees(position_id);
CREATE INDEX IF NOT EXISTS ix_employee_contracts_employee_id ON hr.employee_contracts(employee_id);
CREATE INDEX IF NOT EXISTS ix_cost_profile_lines_profile_id ON hr.cost_profile_lines(cost_profile_id);

-- Custodies & Petty Cash
CREATE INDEX IF NOT EXISTS ix_custodies_employee_id ON fin.custodies(employee_id);
CREATE INDEX IF NOT EXISTS ix_custodies_branch_id ON fin.custodies(branch_id);
CREATE INDEX IF NOT EXISTS ix_custody_settlement_lines_custody_id ON fin.custody_settlement_lines(custody_id);
CREATE INDEX IF NOT EXISTS ix_custody_settlement_lines_account_id ON fin.custody_settlement_lines(expense_account_id);
CREATE INDEX IF NOT EXISTS ix_bank_transfers_custody_id ON fin.bank_transfers(custody_id);

-- Purchases & Payables
CREATE INDEX IF NOT EXISTS ix_purchase_invoices_vendor_id ON pur.purchase_invoices(vendor_id);
CREATE INDEX IF NOT EXISTS ix_purchase_invoices_branch_id ON pur.purchase_invoices(branch_id);
CREATE INDEX IF NOT EXISTS ix_purchase_invoice_lines_invoice_id ON pur.purchase_invoice_lines(invoice_id);

-- Payroll
CREATE INDEX IF NOT EXISTS ix_payroll_runs_period_id ON pay.payroll_runs(fiscal_period_id);
CREATE INDEX IF NOT EXISTS ix_payroll_lines_run_id ON pay.payroll_lines(run_id);
CREATE INDEX IF NOT EXISTS ix_payroll_lines_employee_id ON pay.payroll_lines(employee_id);
CREATE INDEX IF NOT EXISTS ix_loans_employee_id ON pay.loans(employee_id);
CREATE INDEX IF NOT EXISTS ix_loan_installments_loan_id ON pay.loan_installments(loan_id);

-- Fixed Assets
CREATE INDEX IF NOT EXISTS ix_assets_category_id ON ast.assets(category_id);
CREATE INDEX IF NOT EXISTS ix_assets_branch_id ON ast.assets(branch_id);
CREATE INDEX IF NOT EXISTS ix_depreciation_lines_asset_id ON ast.depreciation_lines(asset_id);
