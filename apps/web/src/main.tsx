import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { ApiError } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { AppShell } from './components/AppShell';
import { ErrorBoundary, Loading, ToastProvider } from './components/ui';
import { ChangePasswordPage, LoginPage, SetupWizard } from './pages/auth';
import { BranchesPage, CalendarsPage, CompanyPage, CostCentersPage, CurrenciesPage, DepartmentsPage, FiscalPage, TaxesPage } from './pages/org';
import { AccountsPage, JournalDetailPage, JournalFormPage, JournalsPage, PostingRulesPage } from './pages/accounting';
import { AccountStatementPage, BalanceSheetPage, ClosingPage, ExecutiveIntelligencePage, IncomeStatementPage, SnapshotsPage, TrialBalancePage } from './pages/reports';
import { DashboardPage } from './pages/dashboard';
import { VatReportPage } from './pages/vat-report';
import { ZakatPage } from './pages/zakat';
import { ZatcaHubPage } from './pages/zatca-hub';
import { ZatcaInvoicesPage } from './pages/zatca-invoices';
import { ZatcaOnboardingPage } from './pages/zatca-onboarding';
import { ZatcaQrValidatorPage } from './pages/zatca-qr-validator';
import { AuditLogPage, RolesPage, SecurityEventsPage, UsersPage } from './pages/admin';
import { EmployeeDetailPage, EmployeesPage, PositionsPage } from './pages/hr';
import { CostComponentsPage, CostProfileDetailPage, CostProfilesPage, CostSheetPage } from './pages/cost';
import { AssetCategoriesPage, AssetDetailPage, AssetsPage, DepreciationPage } from './pages/assets';
import { AssignmentsPage, ClientsPage, ProjectDetailPage, ProjectsPage, ServicePricesPage, UtilizationPage } from './pages/projects';
import { LoansPage, MonthlyVariablesPage, PayrollRunsPage, VariableTypesPage, EosbPage } from './pages/payroll';
import { ProfitabilityPage, RevenuePage } from './pages/revenue';
import { CreditNotesPage, InvoiceDetailPage, InvoicesPage } from './pages/sales';
import { PurchaseDebitNotesPage, PurchaseInvoiceDetailPage, PurchaseInvoicesPage, VendorsPage } from './pages/purchases';
import { EmployeeAllocationDaysReportPage } from './pages/allocation-days-report';
import { CustodiesPage } from './pages/custodies';
import { ServiceCatalogPage } from './pages/services';
import { CustodyReportPage } from './pages/custody-report';
import { MultiCurrencyPayrollReportPage } from './pages/multi-currency-payroll-report';
import { CashFlowReportPage } from './pages/cash-flow-report';
import { EmployeeWorkloadCardsPage } from './pages/employee-workload-cards';
import { BanksHubPage } from './pages/banks-hub';
import { AccountsReceivableAgingReportPage } from './pages/ar-aging-report';
import { EmployeeProfitabilityReportPage } from './pages/employee-profitability-report';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2,
    },
  },
});

function Root() {
  const { status, me, company } = useAuth();
  if (status === 'loading') return <div className="flex h-full items-center justify-center"><Loading /></div>;
  if (status === 'setup') return <SetupWizard />;
  if (status === 'anonymous') return <LoginPage />;
  if (me?.user.mustChangePassword) return <ChangePasswordPage forced />;
  if (!company) return <div className="flex h-full items-center justify-center p-10 text-center">لا توجد شركة مرتبطة بحسابك. تواصل مع مدير النظام لإسناد دور لك.</div>;
  return (
    <Routes key={company.id}>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="org/company" element={<CompanyPage />} />
        <Route path="org/branches" element={<BranchesPage />} />
        <Route path="org/departments" element={<DepartmentsPage />} />
        <Route path="org/cost-centers" element={<CostCentersPage />} />
        <Route path="org/currencies" element={<CurrenciesPage />} />
        <Route path="org/fiscal" element={<FiscalPage />} />
        <Route path="org/calendars" element={<CalendarsPage />} />
        <Route path="org/taxes" element={<TaxesPage />} />
        <Route path="hr/positions" element={<PositionsPage />} />
        <Route path="hr/employees" element={<EmployeesPage />} />
        <Route path="hr/employees/:id" element={<EmployeeDetailPage />} />
        <Route path="cost/components" element={<CostComponentsPage />} />
        <Route path="cost/profiles" element={<CostProfilesPage />} />
        <Route path="cost/profiles/:id" element={<CostProfileDetailPage />} />
        <Route path="cost/sheet" element={<CostSheetPage />} />
        <Route path="assets/categories" element={<AssetCategoriesPage />} />
        <Route path="assets/list" element={<AssetsPage />} />
        <Route path="assets/list/:id" element={<AssetDetailPage />} />
        <Route path="assets/depreciation" element={<DepreciationPage />} />
        <Route path="prj/clients" element={<ClientsPage />} />
        <Route path="prj/projects" element={<ProjectsPage />} />
        <Route path="prj/projects/:id" element={<ProjectDetailPage />} />
        <Route path="prj/assignments" element={<AssignmentsPage />} />
        <Route path="prj/employee-tracking" element={<EmployeeWorkloadCardsPage />} />
        <Route path="prj/allocation-days" element={<EmployeeAllocationDaysReportPage />} />
        <Route path="prj/utilization" element={<UtilizationPage />} />
        <Route path="prj/prices" element={<ServicePricesPage />} />
        <Route path="services/catalog" element={<ServiceCatalogPage />} />
        <Route path="prj/services" element={<ServiceCatalogPage />} />
        <Route path="pay/variable-types" element={<VariableTypesPage />} />
        <Route path="pay/variables" element={<MonthlyVariablesPage />} />
        <Route path="pay/loans" element={<LoansPage />} />
        <Route path="pay/runs" element={<PayrollRunsPage />} />
        <Route path="pay/eosb" element={<EosbPage />} />
        <Route path="rev/revenue" element={<RevenuePage />} />
        <Route path="rev/profitability" element={<ProfitabilityPage />} />
        <Route path="sal/invoices" element={<InvoicesPage />} />
        <Route path="sal/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="sal/credit-notes" element={<CreditNotesPage />} />
        <Route path="pur/vendors" element={<VendorsPage />} />
        <Route path="pur/invoices" element={<PurchaseInvoicesPage />} />
        <Route path="pur/invoices/:id" element={<PurchaseInvoiceDetailPage />} />
        <Route path="pur/debit-notes" element={<PurchaseDebitNotesPage />} />
        <Route path="fin/custodies" element={<CustodiesPage />} />
        <Route path="acc/accounts" element={<AccountsPage />} />
        <Route path="acc/banks" element={<BanksHubPage />} />
        <Route path="acc/posting-rules" element={<PostingRulesPage />} />
        <Route path="acc/journals" element={<JournalsPage />} />
        <Route path="acc/journals/new" element={<JournalFormPage />} />
        <Route path="acc/journals/:id" element={<JournalDetailPage />} />
        <Route path="acc/journals/:id/edit" element={<JournalFormPage />} />
        <Route path="closing" element={<ClosingPage />} />
        <Route path="closing/snapshots" element={<SnapshotsPage />} />
        <Route path="reports/executive-intelligence" element={<ExecutiveIntelligencePage />} />
        <Route path="reports/trial-balance" element={<TrialBalancePage />} />
        <Route path="reports/vat-return" element={<VatReportPage />} />
        <Route path="reports/zakat" element={<ZakatPage />} />
        <Route path="sal/zatca" element={<ZatcaHubPage />} />
        <Route path="zatca/hub" element={<ZatcaHubPage />} />
        <Route path="zatca/invoices" element={<ZatcaInvoicesPage />} />
        <Route path="zatca/onboarding" element={<ZatcaOnboardingPage />} />
        <Route path="zatca/qr-validator" element={<ZatcaQrValidatorPage />} />
        <Route path="reports/custody-movement" element={<CustodyReportPage />} />
        <Route path="reports/multi-currency-payroll" element={<MultiCurrencyPayrollReportPage />} />
        <Route path="reports/cash-flow" element={<CashFlowReportPage />} />
        <Route path="reports/employee-profitability" element={<EmployeeProfitabilityReportPage />} />
        <Route path="reports/ar-aging" element={<AccountsReceivableAgingReportPage />} />
        <Route path="reports/account-statement" element={<AccountStatementPage />} />
        <Route path="reports/income-statement" element={<IncomeStatementPage />} />
        <Route path="reports/balance-sheet" element={<BalanceSheetPage />} />
        <Route path="audit/log" element={<AuditLogPage />} />
        <Route path="audit/security" element={<SecurityEventsPage />} />
        <Route path="settings/users" element={<UsersPage />} />
        <Route path="settings/roles" element={<RolesPage />} />
        <Route path="settings/password" element={<ChangePasswordInline />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function ChangePasswordInline() {
  return <div className="-m-5"><ChangePasswordPage /></div>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <ToastProvider>
          <AuthProvider>
            <ErrorBoundary fallbackTitle="حدث خطأ أثناء تحميل واجهة النظام">
              <Root />
            </ErrorBoundary>
          </AuthProvider>
        </ToastProvider>
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
);
