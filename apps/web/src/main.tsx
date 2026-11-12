import { ComponentType, lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { ApiError } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { AppShell } from './components/AppShell';
import { ErrorBoundary, Loading, ToastProvider } from './components/ui';
import { ChangePasswordPage, LoginPage, SetupWizard } from './pages/auth';

const lazyNamed = <T extends Record<string, any>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await loader())[name] as ComponentType<any> }));

const loadOrg = () => import('./pages/org');
const BranchesPage = lazyNamed(loadOrg, 'BranchesPage');
const CalendarsPage = lazyNamed(loadOrg, 'CalendarsPage');
const CompanyPage = lazyNamed(loadOrg, 'CompanyPage');
const CostCentersPage = lazyNamed(loadOrg, 'CostCentersPage');
const CurrenciesPage = lazyNamed(loadOrg, 'CurrenciesPage');
const DepartmentsPage = lazyNamed(loadOrg, 'DepartmentsPage');
const FiscalPage = lazyNamed(loadOrg, 'FiscalPage');
const TaxesPage = lazyNamed(loadOrg, 'TaxesPage');

const loadAccounting = () => import('./pages/accounting');
const AccountsPage = lazyNamed(loadAccounting, 'AccountsPage');
const JournalDetailPage = lazyNamed(loadAccounting, 'JournalDetailPage');
const JournalFormPage = lazyNamed(loadAccounting, 'JournalFormPage');
const JournalsPage = lazyNamed(loadAccounting, 'JournalsPage');
const PostingRulesPage = lazyNamed(loadAccounting, 'PostingRulesPage');

const loadReports = () => import('./pages/reports');
const AccountStatementPage = lazyNamed(loadReports, 'AccountStatementPage');
const BalanceSheetPage = lazyNamed(loadReports, 'BalanceSheetPage');
const ClosingPage = lazyNamed(loadReports, 'ClosingPage');
const ExecutiveIntelligencePage = lazyNamed(loadReports, 'ExecutiveIntelligencePage');
const IncomeStatementPage = lazyNamed(loadReports, 'IncomeStatementPage');
const SnapshotsPage = lazyNamed(loadReports, 'SnapshotsPage');
const TrialBalancePage = lazyNamed(loadReports, 'TrialBalancePage');

const DashboardPage = lazyNamed(() => import('./pages/dashboard'), 'DashboardPage');
const VatReportPage = lazyNamed(() => import('./pages/vat-report'), 'VatReportPage');
const ZakatPage = lazyNamed(() => import('./pages/zakat'), 'ZakatPage');
const ZatcaHubPage = lazyNamed(() => import('./pages/zatca-hub'), 'ZatcaHubPage');
const ZatcaInvoicesPage = lazyNamed(() => import('./pages/zatca-invoices'), 'ZatcaInvoicesPage');
const ZatcaOnboardingPage = lazyNamed(() => import('./pages/zatca-onboarding'), 'ZatcaOnboardingPage');
const ZatcaQrValidatorPage = lazyNamed(() => import('./pages/zatca-qr-validator'), 'ZatcaQrValidatorPage');

const loadAdmin = () => import('./pages/admin');
const AuditLogPage = lazyNamed(loadAdmin, 'AuditLogPage');
const RolesPage = lazyNamed(loadAdmin, 'RolesPage');
const SecurityEventsPage = lazyNamed(loadAdmin, 'SecurityEventsPage');
const UsersPage = lazyNamed(loadAdmin, 'UsersPage');

const loadHr = () => import('./pages/hr');
const EmployeeDetailPage = lazyNamed(loadHr, 'EmployeeDetailPage');
const EmployeesPage = lazyNamed(loadHr, 'EmployeesPage');
const PositionsPage = lazyNamed(loadHr, 'PositionsPage');

const loadCost = () => import('./pages/cost');
const CostComponentsPage = lazyNamed(loadCost, 'CostComponentsPage');
const CostProfileDetailPage = lazyNamed(loadCost, 'CostProfileDetailPage');
const CostProfilesPage = lazyNamed(loadCost, 'CostProfilesPage');
const CostSheetPage = lazyNamed(loadCost, 'CostSheetPage');

const loadAssets = () => import('./pages/assets');
const AssetCategoriesPage = lazyNamed(loadAssets, 'AssetCategoriesPage');
const AssetDetailPage = lazyNamed(loadAssets, 'AssetDetailPage');
const AssetsPage = lazyNamed(loadAssets, 'AssetsPage');
const DepreciationPage = lazyNamed(loadAssets, 'DepreciationPage');

const loadProjects = () => import('./pages/projects');
const AssignmentsPage = lazyNamed(loadProjects, 'AssignmentsPage');
const ClientsPage = lazyNamed(loadProjects, 'ClientsPage');
const ProjectDetailPage = lazyNamed(loadProjects, 'ProjectDetailPage');
const ProjectsPage = lazyNamed(loadProjects, 'ProjectsPage');
const ServicePricesPage = lazyNamed(loadProjects, 'ServicePricesPage');
const UtilizationPage = lazyNamed(loadProjects, 'UtilizationPage');

const loadPayroll = () => import('./pages/payroll');
const LoansPage = lazyNamed(loadPayroll, 'LoansPage');
const MonthlyVariablesPage = lazyNamed(loadPayroll, 'MonthlyVariablesPage');
const PayrollRunsPage = lazyNamed(loadPayroll, 'PayrollRunsPage');
const VariableTypesPage = lazyNamed(loadPayroll, 'VariableTypesPage');
const EosbPage = lazyNamed(loadPayroll, 'EosbPage');

const loadRevenue = () => import('./pages/revenue');
const ProfitabilityPage = lazyNamed(loadRevenue, 'ProfitabilityPage');
const RevenuePage = lazyNamed(loadRevenue, 'RevenuePage');

const loadSales = () => import('./pages/sales');
const CreditNotesPage = lazyNamed(loadSales, 'CreditNotesPage');
const InvoiceDetailPage = lazyNamed(loadSales, 'InvoiceDetailPage');
const InvoicesPage = lazyNamed(loadSales, 'InvoicesPage');

const loadPurchases = () => import('./pages/purchases');
const PurchaseDebitNotesPage = lazyNamed(loadPurchases, 'PurchaseDebitNotesPage');
const PurchaseInvoiceDetailPage = lazyNamed(loadPurchases, 'PurchaseInvoiceDetailPage');
const PurchaseInvoicesPage = lazyNamed(loadPurchases, 'PurchaseInvoicesPage');
const VendorsPage = lazyNamed(loadPurchases, 'VendorsPage');

const EmployeeAllocationDaysReportPage = lazyNamed(() => import('./pages/allocation-days-report'), 'EmployeeAllocationDaysReportPage');
const CustodiesPage = lazyNamed(() => import('./pages/custodies'), 'CustodiesPage');
const ServiceCatalogPage = lazyNamed(() => import('./pages/services'), 'ServiceCatalogPage');
const CustodyReportPage = lazyNamed(() => import('./pages/custody-report'), 'CustodyReportPage');
const MultiCurrencyPayrollReportPage = lazyNamed(() => import('./pages/multi-currency-payroll-report'), 'MultiCurrencyPayrollReportPage');
const CashFlowReportPage = lazyNamed(() => import('./pages/cash-flow-report'), 'CashFlowReportPage');
const EmployeeWorkloadCardsPage = lazyNamed(() => import('./pages/employee-workload-cards'), 'EmployeeWorkloadCardsPage');
const BanksHubPage = lazyNamed(() => import('./pages/banks-hub'), 'BanksHubPage');
const AccountsReceivableAgingReportPage = lazyNamed(() => import('./pages/ar-aging-report'), 'AccountsReceivableAgingReportPage');
const EmployeeProfitabilityReportPage = lazyNamed(() => import('./pages/employee-profitability-report'), 'EmployeeProfitabilityReportPage');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2,
    },
  },
});

function RouteLoader() {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 p-10">
      <Loading />
    </div>
  );
}

function Root() {
  const { status, me, company } = useAuth();
  if (status === 'loading') return <div className="flex h-full items-center justify-center"><Loading /></div>;
  if (status === 'setup') return <SetupWizard />;
  if (status === 'anonymous') return <LoginPage />;
  if (me?.user.mustChangePassword) return <ChangePasswordPage forced />;
  if (!company) return <div className="flex h-full items-center justify-center p-10 text-center">لا توجد شركة مرتبطة بحسابك. تواصل مع مدير النظام لإسناد دور لك.</div>;
  return (
    <Suspense fallback={<RouteLoader />}>
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
    </Suspense>
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
