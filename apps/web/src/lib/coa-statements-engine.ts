/**
 * IDHAM ERP - Unified Chart of Accounts & Dynamic Financial Statements Engine (Local/Offline Parity)
 *
 * Mirrors the PostgreSQL + NestJS LedgerService / AccountsService 1:1 so that
 * Local Safe Mode (GitHub Pages / offline) and API Mode share identical accounting logic:
 * - True multi-level hierarchical Chart of Accounts (Levels 1 -> N) preserving all existing IDs/codes
 * - Dynamic Financial Statement Lines (BS, IS, CF, Equity Changes) configurable from Settings
 * - Effective-dated account reclassification history preserving historical period integrity
 * - Strict accounting guards: POSTED-only statements, no posting to headers, safe move & delete checks
 * - 4 Complete Dynamic Financial Statements with 2-period comparison & full account drill-down
 */

import { getEntityList, saveEntityItem, deleteEntityItem, uid } from './local-store';
import { getStoredCompany } from './storage-company';

function recordAudit(input: {
  action: string;
  tableName: string;
  schemaName?: string;
  entityId?: string;
  reason?: string;
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
}) {
  const now = new Date().toISOString();
  const id = uid('aud');
  const recId = input.entityId || id;
  const changedFields = input.newValues
    ? Array.from(new Set([...Object.keys(input.oldValues || {}), ...Object.keys(input.newValues || {})]))
        .filter((k) => JSON.stringify(input.oldValues?.[k]) !== JSON.stringify(input.newValues?.[k]))
    : [];
  return saveEntityItem('audit_log', {
    id,
    occurredAt: now,
    createdAt: now,
    userName: 'المدير التنفيذي',
    actor: 'المدير التنفيذي',
    action: input.action,
    schemaName: input.schemaName || 'acc',
    tableName: input.tableName,
    entityId: recId,
    recordId: recId,
    changedFields,
    reason: input.reason || null,
    oldValues: input.oldValues ?? null,
    newValues: input.newValues ?? null,
    device: 'IDHAM ERP Web Client',
    ip: '127.0.0.1',
  });
}

export type StatementType = 'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'CASH_FLOW' | 'EQUITY_CHANGES';

export type AccountStatementSection =
  | 'CURRENT_ASSETS'
  | 'NON_CURRENT_ASSETS'
  | 'CURRENT_LIABILITIES'
  | 'NON_CURRENT_LIABILITIES'
  | 'EQUITY'
  | 'REVENUE'
  | 'COST_OF_SALES'
  | 'OPERATING_EXPENSES'
  | 'OTHER_INCOME'
  | 'OTHER_EXPENSES'
  | 'ZAKAT_TAX';

export type CashFlowCategory = 'CASH' | 'OPERATING' | 'INVESTING' | 'FINANCING' | 'NON_CASH';

export interface DimensionFilterParams {
  branchId?: string;
  costCenterId?: string;
  departmentId?: string;
  projectId?: string;
  clientId?: string;
  employeeId?: string;
  ledger?: string;
}

export const DEFAULT_LOCAL_COST_CENTERS = [
  { id: 'cc-ops', code: 'CC-OPS', nameAr: 'قطاع العمليات والتشغيل والتنفيذ', nameEn: 'Operations & Delivery Sector', ccType: 'DIRECT', isPosting: false, isActive: true, parentId: null },
  { id: 'cc-del', code: 'CC-DEL', nameAr: 'مركز تكلفة التسليم والمشاريع', nameEn: 'Project Delivery Center', ccType: 'DIRECT', isPosting: true, isActive: true, parentId: 'cc-ops' },
  { id: 'cc-rnd', code: 'CC-RND', nameAr: 'مركز تكلفة البحوث والتطوير R&D', nameEn: 'R&D & Innovation Center', ccType: 'INDIRECT', isPosting: true, isActive: true, parentId: 'cc-ops' },
  { id: 'cc-adm', code: 'CC-ADM', nameAr: 'الإدارة العامة والخدمات المشتركة', nameEn: 'General & Admin Center', ccType: 'ADMIN', isPosting: true, isActive: true, parentId: null },
];

export function getLocalCostCenters(): any[] {
  return getEntityList<any>('cost_centers', DEFAULT_LOCAL_COST_CENTERS);
}

export function expandLocalCostCenterIds(rootId?: string | null): Set<string> | null {
  if (!rootId) return null;
  const centers = getLocalCostCenters();
  const childrenMap = new Map<string, string[]>();
  for (const c of centers) {
    if (c.parentId) {
      const list = childrenMap.get(c.parentId) ?? [];
      list.push(c.id);
      childrenMap.set(c.parentId, list);
    }
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    for (const ch of childrenMap.get(cur) ?? []) stack.push(ch);
  }
  return out;
}

export function createLineDimResolver() {
  const centers = getLocalCostCenters();
  const prjs = getEntityList<any>('projects', []);
  const emps = getEntityList<any>('employees', []);
  const depts = getEntityList<any>('departments', []);
  const clients = getEntityList<any>('clients', []);

  const ccById = new Map(centers.map((c: any) => [c.id, c]));
  const ccByCode = new Map(centers.map((c: any) => [String(c.code || '').toUpperCase(), c]));
  const prjById = new Map(prjs.map((p: any) => [p.id, p]));
  const prjByCode = new Map(prjs.map((p: any) => [p.code, p]));
  const empById = new Map(emps.map((e: any) => [e.id, e]));
  const empByCode = new Map(emps.map((e: any) => [e.code, e]));
  const deptById = new Map(depts.map((d: any) => [d.id, d]));
  const cliById = new Map(clients.map((c: any) => [c.id, c]));

  return (l: any) => {
    const prj = (l.projectId && (prjById.get(l.projectId) || prjByCode.get(l.projectId))) || null;
    const emp = (l.employeeId && (empById.get(l.employeeId) || empByCode.get(l.employeeId))) || null;
    const departmentId = l.departmentId || emp?.departmentId || emp?.placement?.departmentId || null;
    const dept = departmentId ? deptById.get(departmentId) : null;
    const empAutoCc = emp ? (ccById.get(`cc-emp-${emp.id}`) || ccByCode.get(`CC-${String(emp.code || '').toUpperCase()}`)) : null;
    const costCenterId = l.costCenterId || prj?.costCenterId || emp?.costCenterId || emp?.placement?.costCenterId || empAutoCc?.id || dept?.defaultCostCenterId || null;
    const cc = costCenterId ? ccById.get(costCenterId) : null;
    const clientId = l.clientId || prj?.clientId || null;
    const cli = clientId ? cliById.get(clientId) : null;
    const branchId = l.branchId || prj?.branchId || emp?.branchId || emp?.placement?.branchId || dept?.branchId || null;
    const projectId = prj?.id || l.projectId || null;
    const employeeId = emp?.id || l.employeeId || null;

    return {
      branchId,
      departmentId,
      costCenterId,
      costCenterCode: cc?.code || null,
      costCenterName: cc?.nameAr || l.costCenterName || null,
      projectId,
      projectCode: prj?.code || l.projectCode || null,
      projectName: prj?.nameAr || l.projectName || null,
      clientId,
      clientCode: cli?.code || null,
      clientName: cli?.nameAr || prj?.clientName || l.clientName || null,
      employeeId,
      employeeCode: emp?.code || null,
      employeeName: emp?.fullNameAr || l.employeeName || null,
    };
  };
}

export function createLineDimMatcher(params: DimensionFilterParams) {
  const needsDim = Boolean(
    params.branchId || params.costCenterId || params.departmentId || params.projectId || params.clientId || params.employeeId,
  );
  if (!needsDim) return () => true;
  const ccSet = expandLocalCostCenterIds(params.costCenterId);
  const resolve = createLineDimResolver();

  return (l: any): boolean => {
    const d = resolve(l);
    if (params.branchId && d.branchId !== params.branchId) return false;
    if (ccSet && (!d.costCenterId || !ccSet.has(d.costCenterId))) return false;
    if (params.departmentId && d.departmentId !== params.departmentId) return false;
    if (params.projectId && d.projectId !== params.projectId) return false;
    if (params.clientId && d.clientId !== params.clientId) return false;
    if (params.employeeId && d.employeeId !== params.employeeId) return false;
    return true;
  };
}

export const BS_SECTIONS = new Set<string>([
  'CURRENT_ASSETS',
  'NON_CURRENT_ASSETS',
  'CURRENT_LIABILITIES',
  'NON_CURRENT_LIABILITIES',
  'EQUITY',
]);

export const IS_SECTIONS = new Set<string>([
  'REVENUE',
  'COST_OF_SALES',
  'OPERATING_EXPENSES',
  'OTHER_INCOME',
  'OTHER_EXPENSES',
  'ZAKAT_TAX',
]);

export const NORMAL_BALANCE_BY_CLASS: Record<string, 'DEBIT' | 'CREDIT'> = {
  ASSET: 'DEBIT',
  DIRECT_COST: 'DEBIT',
  OPERATING_EXPENSE: 'DEBIT',
  OTHER_EXPENSE: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  REVENUE: 'CREDIT',
  OTHER_INCOME: 'CREDIT',
};

// ---------------------------------------------------------------------------
// 1. Default Dynamic Financial Statement Lines (Configurable from Settings)
// ---------------------------------------------------------------------------
export const defaultStatementLinesList = [
  // Balance Sheet
  { id: 'sl-bs-ca', statementType: 'BALANCE_SHEET', sectionCode: 'CURRENT_ASSETS', code: 'BS-CA', nameAr: 'الأصول المتداولة', nameEn: 'Current Assets', normalSign: 1, sortOrder: 10, isSystem: true, isActive: true, description: 'النقدية والبنوك والعملاء والعهد والضرائب المدينة والمقدمات' },
  { id: 'sl-bs-nca', statementType: 'BALANCE_SHEET', sectionCode: 'NON_CURRENT_ASSETS', code: 'BS-NCA', nameAr: 'الأصول غير المتداولة', nameEn: 'Non-Current Assets', normalSign: 1, sortOrder: 20, isSystem: true, isActive: true, description: 'الممتلكات والمعدات والأصول الثابتة مطروحاً منها مجمع الإهلاك' },
  { id: 'sl-bs-cl', statementType: 'BALANCE_SHEET', sectionCode: 'CURRENT_LIABILITIES', code: 'BS-CL', nameAr: 'الالتزامات المتداولة', nameEn: 'Current Liabilities', normalSign: -1, sortOrder: 30, isSystem: true, isActive: true, description: 'الموردون وضريبة القيمة المضافة والرواتب والتأمينات والزكاة المستحقة' },
  { id: 'sl-bs-ncl', statementType: 'BALANCE_SHEET', sectionCode: 'NON_CURRENT_LIABILITIES', code: 'BS-NCL', nameAr: 'الالتزامات طويلة الأجل', nameEn: 'Non-Current Liabilities', normalSign: -1, sortOrder: 40, isSystem: true, isActive: true, description: 'مخصص مكافأة نهاية الخدمة والقروض والالتزامات غير المتداولة' },
  { id: 'sl-bs-eq', statementType: 'BALANCE_SHEET', sectionCode: 'EQUITY', code: 'BS-EQ', nameAr: 'حقوق الملكية', nameEn: 'Shareholders Equity', normalSign: -1, sortOrder: 50, isSystem: true, isActive: true, description: 'رأس المال المدفوع والاحتياطيات والأرباح المبقاة' },

  // Income Statement
  { id: 'sl-is-rev', statementType: 'INCOME_STATEMENT', sectionCode: 'REVENUE', code: 'IS-REV', nameAr: 'الإيرادات التشغيلية', nameEn: 'Operating Revenue', normalSign: -1, sortOrder: 10, isSystem: true, isActive: true, description: 'إيرادات عقود ومشاريع الكوادر والبرمجيات والخدمات' },
  { id: 'sl-is-cos', statementType: 'INCOME_STATEMENT', sectionCode: 'COST_OF_SALES', code: 'IS-COS', nameAr: 'تكلفة المبيعات والخدمات المباشرة', nameEn: 'Cost of Sales', normalSign: 1, sortOrder: 20, isSystem: true, isActive: true, description: 'رواتب المطورين المباشرة وتكلفة التأمينات والبدلات المباشرة للمشاريع' },
  { id: 'sl-is-opex', statementType: 'INCOME_STATEMENT', sectionCode: 'OPERATING_EXPENSES', code: 'IS-OPEX', nameAr: 'المصروفات التشغيلية والإدارية', nameEn: 'Operating Expenses', normalSign: 1, sortOrder: 30, isSystem: true, isActive: true, description: 'المصروفات العمومية والإدارية والإهلاك وتكلفة التفرغ والعمولات البنكية' },
  { id: 'sl-is-oinc', statementType: 'INCOME_STATEMENT', sectionCode: 'OTHER_INCOME', code: 'IS-OINC', nameAr: 'الإيرادات الأخرى', nameEn: 'Other Income', normalSign: -1, sortOrder: 40, isSystem: true, isActive: true, description: 'أرباح فروق العملات والإيرادات غير التشغيلية' },
  { id: 'sl-is-oexp', statementType: 'INCOME_STATEMENT', sectionCode: 'OTHER_EXPENSES', code: 'IS-OEXP', nameAr: 'المصروفات الأخرى', nameEn: 'Other Expenses', normalSign: 1, sortOrder: 50, isSystem: true, isActive: true, description: 'خسائر فروق العملات والمصروفات غير التشغيلية' },
  { id: 'sl-is-tax', statementType: 'INCOME_STATEMENT', sectionCode: 'ZAKAT_TAX', code: 'IS-TAX', nameAr: 'مصروف الزكاة الشرعية وضريبة الدخل', nameEn: 'Zakat & Tax Expense', normalSign: 1, sortOrder: 60, isSystem: true, isActive: true, description: 'مخصص الزكاة الشرعية وضريبة الدخل للفترة' },

  // Cash Flow
  { id: 'sl-cf-op', statementType: 'CASH_FLOW', sectionCode: 'OPERATING_ACTIVITIES', code: 'CF-OP', nameAr: 'التدفقات النقدية من الأنشطة التشغيلية', nameEn: 'Operating Activities', normalSign: 1, sortOrder: 10, isSystem: true, isActive: true, description: 'التحصيلات من العملاء والمدفوعات للموردين والموظفين والمصروفات والضرائب' },
  { id: 'sl-cf-inv', statementType: 'CASH_FLOW', sectionCode: 'INVESTING_ACTIVITIES', code: 'CF-INV', nameAr: 'التدفقات النقدية من الأنشطة الاستثمارية', nameEn: 'Investing Activities', normalSign: 1, sortOrder: 20, isSystem: true, isActive: true, description: 'شراء وبيع الأصول الثابتة والمعدات والاستثمارات طويلة الأجل' },
  { id: 'sl-cf-fin', statementType: 'CASH_FLOW', sectionCode: 'FINANCING_ACTIVITIES', code: 'CF-FIN', nameAr: 'التدفقات النقدية من الأنشطة التمويلية', nameEn: 'Financing Activities', normalSign: 1, sortOrder: 30, isSystem: true, isActive: true, description: 'زيادة رأس المال والتوزيعات والقروض التمويلية' },
  { id: 'sl-cf-cash', statementType: 'CASH_FLOW', sectionCode: 'CASH_EQUIVALENTS', code: 'CF-CASH', nameAr: 'النقدية وما في حكمها', nameEn: 'Cash & Equivalents', normalSign: 1, sortOrder: 40, isSystem: true, isActive: true, description: 'الصناديق النقدية والحسابات البنكية الجارية' },

  // Changes in Equity
  { id: 'sl-eq-cap', statementType: 'EQUITY_CHANGES', sectionCode: 'PAID_IN_CAPITAL', code: 'EQ-CAP', nameAr: 'رأس المال المدفوع', nameEn: 'Paid-in Capital', normalSign: -1, sortOrder: 10, isSystem: true, isActive: true, description: 'رأس المال المصرح والمدفوع' },
  { id: 'sl-eq-res', statementType: 'EQUITY_CHANGES', sectionCode: 'STATUTORY_RESERVE', code: 'EQ-RES', nameAr: 'الاحتياطي النظامي والاحتياطيات', nameEn: 'Statutory Reserve', normalSign: -1, sortOrder: 20, isSystem: true, isActive: true, description: 'الاحتياطيات المقتطعة من صافي الأرباح' },
  { id: 'sl-eq-re', statementType: 'EQUITY_CHANGES', sectionCode: 'RETAINED_EARNINGS', code: 'EQ-RE', nameAr: 'الأرباح المبقاة (المرحّلة)', nameEn: 'Retained Earnings', normalSign: -1, sortOrder: 30, isSystem: true, isActive: true, description: 'الأرباح المتراكمة المرحلة من السنوات السابقة' },
  { id: 'sl-eq-div', statementType: 'EQUITY_CHANGES', sectionCode: 'DIVIDENDS_DISTRIBUTIONS', code: 'EQ-DIV', nameAr: 'توزيعات الأرباح وجاري الشركاء', nameEn: 'Dividends & Drawings', normalSign: -1, sortOrder: 40, isSystem: true, isActive: true, description: 'التوزيعات المعتمدة والمسحوبات' },
  { id: 'sl-eq-oth', statementType: 'EQUITY_CHANGES', sectionCode: 'OTHER_EQUITY', code: 'EQ-OTH', nameAr: 'بنود حقوق ملكية أخرى', nameEn: 'Other Equity', normalSign: -1, sortOrder: 50, isSystem: true, isActive: true, description: 'أي احتياطيات أو بنود حقوق ملكية أخرى' },
];

// ---------------------------------------------------------------------------
// 2. Hierarchical Parent Header Accounts (Levels 1 -> 3)
//    All existing 31 posting accounts attach under these headers with 100% ID/code compatibility!
// ---------------------------------------------------------------------------
export const defaultHeaderAccountsList = [
  // Level 1 Roots
  { id: 'acc-h-1', parentId: null, code: '1', nameAr: 'الأصول', nameEn: 'Assets', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: false, level: 1, statementSection: 'CURRENT_ASSETS', statementLineId: 'sl-bs-ca', cashFlowCategory: 'OPERATING', isActive: true, description: 'الحساب الرئيسي الجامع لكافة الأصول المتداولة وغير المتداولة' },
  { id: 'acc-h-2', parentId: null, code: '2', nameAr: 'الالتزامات والخصوم', nameEn: 'Liabilities', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: false, level: 1, statementSection: 'CURRENT_LIABILITIES', statementLineId: 'sl-bs-cl', cashFlowCategory: 'OPERATING', isActive: true, description: 'الحساب الرئيسي الجامع لكافة الالتزامات المتداولة وطويلة الأجل' },
  { id: 'acc-h-3', parentId: null, code: '3', nameAr: 'حقوق الملكية', nameEn: 'Equity', accountClass: 'EQUITY', normalBalance: 'CREDIT', isPosting: false, level: 1, statementSection: 'EQUITY', statementLineId: 'sl-bs-eq', cashFlowCategory: 'FINANCING', isActive: true, description: 'الحساب الرئيسي لحقوق المساهمين والشركاء' },
  { id: 'acc-h-4', parentId: null, code: '4', nameAr: 'الإيرادات', nameEn: 'Revenue', accountClass: 'REVENUE', normalBalance: 'CREDIT', isPosting: false, level: 1, statementSection: 'REVENUE', statementLineId: 'sl-is-rev', cashFlowCategory: 'OPERATING', isActive: true, description: 'الحساب الرئيسي لإيرادات النشاط الأساسي' },
  { id: 'acc-h-42', parentId: null, code: '42', nameAr: 'الإيرادات الأخرى', nameEn: 'Other Income', accountClass: 'OTHER_INCOME', normalBalance: 'CREDIT', isPosting: false, level: 1, statementSection: 'OTHER_INCOME', statementLineId: 'sl-is-oinc', cashFlowCategory: 'OPERATING', isActive: true, description: 'الإيرادات غير التشغيلية وأرباح فروق العملات' },
  { id: 'acc-h-51', parentId: null, code: '51', nameAr: 'تكلفة المبيعات والخدمات المباشرة', nameEn: 'Direct Costs', accountClass: 'DIRECT_COST', normalBalance: 'DEBIT', isPosting: false, level: 1, statementSection: 'COST_OF_SALES', statementLineId: 'sl-is-cos', cashFlowCategory: 'OPERATING', isActive: true, description: 'التكاليف المباشرة لتشغيل المشاريع والخدمات' },
  { id: 'acc-h-52', parentId: null, code: '52', nameAr: 'المصروفات التشغيلية والإدارية', nameEn: 'Operating Expenses', accountClass: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', isPosting: false, level: 1, statementSection: 'OPERATING_EXPENSES', statementLineId: 'sl-is-opex', cashFlowCategory: 'OPERATING', isActive: true, description: 'المصروفات العمومية والإدارية والإهلاك والزكاة' },
  { id: 'acc-h-53', parentId: null, code: '53', nameAr: 'المصروفات الأخرى', nameEn: 'Other Expenses', accountClass: 'OTHER_EXPENSE', normalBalance: 'DEBIT', isPosting: false, level: 1, statementSection: 'OTHER_EXPENSES', statementLineId: 'sl-is-oexp', cashFlowCategory: 'OPERATING', isActive: true, description: 'خسائر فروق العملات والمصروفات غير التشغيلية' },

  // Level 2 Balance Sheet Sections
  { id: 'acc-h-11', parentId: 'acc-h-1', code: '11', nameAr: 'الأصول المتداولة', nameEn: 'Current Assets', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: false, level: 2, statementSection: 'CURRENT_ASSETS', statementLineId: 'sl-bs-ca', cashFlowCategory: 'OPERATING', isActive: true },
  { id: 'acc-h-12', parentId: 'acc-h-1', code: '12', nameAr: 'الأصول غير المتداولة', nameEn: 'Non-Current Assets', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: false, level: 2, statementSection: 'NON_CURRENT_ASSETS', statementLineId: 'sl-bs-nca', cashFlowCategory: 'INVESTING', isActive: true },
  { id: 'acc-h-21', parentId: 'acc-h-2', code: '21', nameAr: 'الالتزامات المتداولة', nameEn: 'Current Liabilities', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: false, level: 2, statementSection: 'CURRENT_LIABILITIES', statementLineId: 'sl-bs-cl', cashFlowCategory: 'OPERATING', isActive: true },
  { id: 'acc-h-22', parentId: 'acc-h-2', code: '22', nameAr: 'الالتزامات طويلة الأجل', nameEn: 'Non-Current Liabilities', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: false, level: 2, statementSection: 'NON_CURRENT_LIABILITIES', statementLineId: 'sl-bs-ncl', cashFlowCategory: 'OPERATING', isActive: true },
  { id: 'acc-h-31', parentId: 'acc-h-3', code: '31', nameAr: 'رأس المال والاحتياطيات والأرباح المبقاة', nameEn: 'Capital & Retained Earnings', accountClass: 'EQUITY', normalBalance: 'CREDIT', isPosting: false, level: 2, statementSection: 'EQUITY', statementLineId: 'sl-bs-eq', cashFlowCategory: 'FINANCING', isActive: true },

  // Level 3 Sub-Groups under Current & Non-Current Assets / Liabilities
  { id: 'acc-h-1101', parentId: 'acc-h-11', code: '1101', nameAr: 'النقدية والبنوك', nameEn: 'Cash & Banks', accountClass: 'ASSET', subtype: 'BANK', normalBalance: 'DEBIT', isPosting: false, level: 3, statementSection: 'CURRENT_ASSETS', statementLineId: 'sl-bs-ca', cashFlowCategory: 'CASH', isActive: true },
  { id: 'acc-h-1102', parentId: 'acc-h-11', code: '1102', nameAr: 'العملاء والذمم المدينة والإيرادات المستحقة', nameEn: 'Receivables & Unbilled', accountClass: 'ASSET', subtype: 'RECEIVABLE', normalBalance: 'DEBIT', isPosting: false, level: 3, statementSection: 'CURRENT_ASSETS', statementLineId: 'sl-bs-ca', cashFlowCategory: 'OPERATING', isActive: true },
  { id: 'acc-h-1103', parentId: 'acc-h-11', code: '1103', nameAr: 'العهد والسلف وضرائب المدخلات', nameEn: 'Custodies, Loans & Input VAT', accountClass: 'ASSET', subtype: 'EMPLOYEE_RECEIVABLE', normalBalance: 'DEBIT', isPosting: false, level: 3, statementSection: 'CURRENT_ASSETS', statementLineId: 'sl-bs-ca', cashFlowCategory: 'OPERATING', isActive: true },
  { id: 'acc-h-1201', parentId: 'acc-h-12', code: '1201', nameAr: 'الممتلكات والمعدات والأصول الثابتة', nameEn: 'Property & Equipment', accountClass: 'ASSET', subtype: 'FIXED_ASSET', normalBalance: 'DEBIT', isPosting: false, level: 3, statementSection: 'NON_CURRENT_ASSETS', statementLineId: 'sl-bs-nca', cashFlowCategory: 'INVESTING', isActive: true },
  { id: 'acc-h-2101', parentId: 'acc-h-21', code: '2101', nameAr: 'الموردون والذمم الدائنة', nameEn: 'Accounts Payable', accountClass: 'LIABILITY', subtype: 'PAYABLE', normalBalance: 'CREDIT', isPosting: false, level: 3, statementSection: 'CURRENT_LIABILITIES', statementLineId: 'sl-bs-cl', cashFlowCategory: 'OPERATING', isActive: true },
  { id: 'acc-h-2102', parentId: 'acc-h-21', code: '2102', nameAr: 'الضرائب والرواتب والتأمينات والزكاة المستحقة', nameEn: 'Taxes, Payroll & Accruals', accountClass: 'LIABILITY', subtype: 'ACCRUED', normalBalance: 'CREDIT', isPosting: false, level: 3, statementSection: 'CURRENT_LIABILITIES', statementLineId: 'sl-bs-cl', cashFlowCategory: 'OPERATING', isActive: true },
];

/** Default parent + rich classification metadata for the 31 standard posting accounts. */
export const DEFAULT_POSTING_ACCOUNT_META: Record<
  string,
  {
    parentId: string;
    subtype: string;
    statementSection: AccountStatementSection;
    statementLineId: string;
    cashFlowCategory: CashFlowCategory;
    equityLineId?: string;
    isContra?: boolean;
  }
> = {
  '10101': { parentId: 'acc-h-1101', subtype: 'CASH', statementSection: 'CURRENT_ASSETS', statementLineId: 'sl-bs-ca', cashFlowCategory: 'CASH' },
  '10102': { parentId: 'acc-h-1101', subtype: 'CASH', statementSection: 'CURRENT_ASSETS', statementLineId: 'sl-bs-ca', cashFlowCategory: 'CASH' },
  '10201': { parentId: 'acc-h-1101', subtype: 'BANK', statementSection: 'CURRENT_ASSETS', statementLineId: 'sl-bs-ca', cashFlowCategory: 'CASH' },
  '10202': { parentId: 'acc-h-1101', subtype: 'BANK', statementSection: 'CURRENT_ASSETS', statementLineId: 'sl-bs-ca', cashFlowCategory: 'CASH' },
  '10301': { parentId: 'acc-h-1102', subtype: 'RECEIVABLE', statementSection: 'CURRENT_ASSETS', statementLineId: 'sl-bs-ca', cashFlowCategory: 'OPERATING' },
  '10305': { parentId: 'acc-h-1102', subtype: 'RECEIVABLE', statementSection: 'CURRENT_ASSETS', statementLineId: 'sl-bs-ca', cashFlowCategory: 'OPERATING' },
  '110301': { parentId: 'acc-h-1102', subtype: 'RECEIVABLE', statementSection: 'CURRENT_ASSETS', statementLineId: 'sl-bs-ca', cashFlowCategory: 'OPERATING' },
  '10401': { parentId: 'acc-h-1103', subtype: 'EMPLOYEE_RECEIVABLE', statementSection: 'CURRENT_ASSETS', statementLineId: 'sl-bs-ca', cashFlowCategory: 'OPERATING' },
  '1250': { parentId: 'acc-h-1103', subtype: 'TAX', statementSection: 'CURRENT_ASSETS', statementLineId: 'sl-bs-ca', cashFlowCategory: 'OPERATING' },
  '1310': { parentId: 'acc-h-1103', subtype: 'CASH', statementSection: 'CURRENT_ASSETS', statementLineId: 'sl-bs-ca', cashFlowCategory: 'CASH' },
  '1320': { parentId: 'acc-h-1103', subtype: 'CASH', statementSection: 'CURRENT_ASSETS', statementLineId: 'sl-bs-ca', cashFlowCategory: 'CASH' },
  '10501': { parentId: 'acc-h-1201', subtype: 'FIXED_ASSET', statementSection: 'NON_CURRENT_ASSETS', statementLineId: 'sl-bs-nca', cashFlowCategory: 'INVESTING' },
  '10502': { parentId: 'acc-h-1201', subtype: 'ACCUMULATED_DEPRECIATION', statementSection: 'NON_CURRENT_ASSETS', statementLineId: 'sl-bs-nca', cashFlowCategory: 'NON_CASH', isContra: true },
  '20101': { parentId: 'acc-h-2101', subtype: 'PAYABLE', statementSection: 'CURRENT_LIABILITIES', statementLineId: 'sl-bs-cl', cashFlowCategory: 'OPERATING' },
  '20105': { parentId: 'acc-h-2101', subtype: 'PAYABLE', statementSection: 'CURRENT_LIABILITIES', statementLineId: 'sl-bs-cl', cashFlowCategory: 'OPERATING' },
  '20201': { parentId: 'acc-h-2102', subtype: 'TAX', statementSection: 'CURRENT_LIABILITIES', statementLineId: 'sl-bs-cl', cashFlowCategory: 'OPERATING' },
  '20301': { parentId: 'acc-h-2102', subtype: 'PAYROLL_LIABILITY', statementSection: 'CURRENT_LIABILITIES', statementLineId: 'sl-bs-cl', cashFlowCategory: 'OPERATING' },
  '20401': { parentId: 'acc-h-2102', subtype: 'PAYROLL_LIABILITY', statementSection: 'CURRENT_LIABILITIES', statementLineId: 'sl-bs-cl', cashFlowCategory: 'OPERATING' },
  '20402': { parentId: 'acc-h-22', subtype: 'ACCRUED', statementSection: 'NON_CURRENT_LIABILITIES', statementLineId: 'sl-bs-ncl', cashFlowCategory: 'OPERATING' },
  '20501': { parentId: 'acc-h-2102', subtype: 'TAX', statementSection: 'CURRENT_LIABILITIES', statementLineId: 'sl-bs-cl', cashFlowCategory: 'OPERATING' },
  '30101': { parentId: 'acc-h-31', subtype: 'OTHER', statementSection: 'EQUITY', statementLineId: 'sl-bs-eq', equityLineId: 'sl-eq-cap', cashFlowCategory: 'FINANCING' },
  '30201': { parentId: 'acc-h-31', subtype: 'RETAINED_EARNINGS', statementSection: 'EQUITY', statementLineId: 'sl-bs-eq', equityLineId: 'sl-eq-re', cashFlowCategory: 'FINANCING' },
  '40101': { parentId: 'acc-h-4', subtype: 'OTHER', statementSection: 'REVENUE', statementLineId: 'sl-is-rev', cashFlowCategory: 'OPERATING' },
  '410101': { parentId: 'acc-h-4', subtype: 'OTHER', statementSection: 'REVENUE', statementLineId: 'sl-is-rev', cashFlowCategory: 'OPERATING' },
  '4300': { parentId: 'acc-h-42', subtype: 'FX_GAIN_LOSS', statementSection: 'OTHER_INCOME', statementLineId: 'sl-is-oinc', cashFlowCategory: 'OPERATING' },
  '50101': { parentId: 'acc-h-51', subtype: 'OTHER', statementSection: 'COST_OF_SALES', statementLineId: 'sl-is-cos', cashFlowCategory: 'OPERATING' },
  '50201': { parentId: 'acc-h-51', subtype: 'OTHER', statementSection: 'COST_OF_SALES', statementLineId: 'sl-is-cos', cashFlowCategory: 'OPERATING' },
  '50102': { parentId: 'acc-h-52', subtype: 'OTHER', statementSection: 'OPERATING_EXPENSES', statementLineId: 'sl-is-opex', cashFlowCategory: 'OPERATING' },
  '50103': { parentId: 'acc-h-52', subtype: 'ACCRUED', statementSection: 'OPERATING_EXPENSES', statementLineId: 'sl-is-opex', cashFlowCategory: 'NON_CASH' },
  '50301': { parentId: 'acc-h-52', subtype: 'OTHER', statementSection: 'OPERATING_EXPENSES', statementLineId: 'sl-is-opex', cashFlowCategory: 'NON_CASH' },
  '50401': { parentId: 'acc-h-52', subtype: 'OTHER', statementSection: 'OPERATING_EXPENSES', statementLineId: 'sl-is-opex', cashFlowCategory: 'OPERATING' },
  '50402': { parentId: 'acc-h-52', subtype: 'OTHER', statementSection: 'OPERATING_EXPENSES', statementLineId: 'sl-is-opex', cashFlowCategory: 'OPERATING' },
  '50501': { parentId: 'acc-h-52', subtype: 'TAX', statementSection: 'ZAKAT_TAX', statementLineId: 'sl-is-tax', cashFlowCategory: 'OPERATING' },
  '5700': { parentId: 'acc-h-53', subtype: 'FX_GAIN_LOSS', statementSection: 'OTHER_EXPENSES', statementLineId: 'sl-is-oexp', cashFlowCategory: 'OPERATING' },
};

// ---------------------------------------------------------------------------
// 3. Classification & Code Generation Helpers
// ---------------------------------------------------------------------------
export function inferLocalStatementSection(a: any): AccountStatementSection {
  if (a.statementSection && (BS_SECTIONS.has(a.statementSection) || IS_SECTIONS.has(a.statementSection))) {
    return a.statementSection as AccountStatementSection;
  }
  const meta = DEFAULT_POSTING_ACCOUNT_META[String(a.code || '')];
  if (meta) return meta.statementSection;

  const cls = a.accountClass || 'ASSET';
  const sub = a.subtype || '';
  const name = String(a.nameAr || '');
  const code = String(a.code || '');
  if (cls === 'ASSET') {
    if (sub === 'FIXED_ASSET' || sub === 'ACCUMULATED_DEPRECIATION' || code.startsWith('12') || code.startsWith('105')) return 'NON_CURRENT_ASSETS';
    return 'CURRENT_ASSETS';
  }
  if (cls === 'LIABILITY') {
    if (name.includes('نهاية الخدمة') || name.includes('طويلة الأجل') || code.startsWith('22') || code === '20402') return 'NON_CURRENT_LIABILITIES';
    return 'CURRENT_LIABILITIES';
  }
  if (cls === 'EQUITY') return 'EQUITY';
  if (cls === 'REVENUE') return 'REVENUE';
  if (cls === 'DIRECT_COST') return 'COST_OF_SALES';
  if (cls === 'OTHER_INCOME') return 'OTHER_INCOME';
  if (cls === 'OTHER_EXPENSE') return 'OTHER_EXPENSES';
  if (name.includes('زكاة') || code === '50501') return 'ZAKAT_TAX';
  return 'OPERATING_EXPENSES';
}

export function inferLocalCashFlowCategory(a: any): CashFlowCategory {
  if (a.cashFlowCategory && ['CASH', 'OPERATING', 'INVESTING', 'FINANCING', 'NON_CASH'].includes(a.cashFlowCategory)) {
    return a.cashFlowCategory as CashFlowCategory;
  }
  const meta = DEFAULT_POSTING_ACCOUNT_META[String(a.code || '')];
  if (meta) return meta.cashFlowCategory;
  const sub = a.subtype || '';
  const code = String(a.code || '');
  const name = String(a.nameAr || '');
  if (sub === 'CASH' || sub === 'BANK' || code.startsWith('101') || code.startsWith('102')) return 'CASH';
  if (sub === 'ACCUMULATED_DEPRECIATION' || name.includes('إهلاك')) return 'NON_CASH';
  if (sub === 'FIXED_ASSET' || inferLocalStatementSection(a) === 'NON_CURRENT_ASSETS') return 'INVESTING';
  if (a.accountClass === 'EQUITY' || (a.accountClass === 'LIABILITY' && name.includes('قرض'))) return 'FINANCING';
  return 'OPERATING';
}

export function inferLocalEquitySection(a: any): string {
  const name = String(a.nameAr || '');
  const code = String(a.code || '');
  if (a.subtype === 'RETAINED_EARNINGS' || name.includes('أرباح مبقاة') || name.includes('مرحلة') || code.startsWith('302')) return 'RETAINED_EARNINGS';
  if (name.includes('احتياطي')) return 'STATUTORY_RESERVE';
  if (name.includes('توزيع') || name.includes('جاري')) return 'DIVIDENDS_DISTRIBUTIONS';
  if (name.includes('رأس المال') || code.startsWith('301')) return 'PAID_IN_CAPITAL';
  return 'OTHER_EQUITY';
}

export function suggestNextLocalCode(parentCode: string | null, existingSiblingCodes: string[], accountClass?: string): string {
  const existingSet = new Set(existingSiblingCodes.map((c) => String(c).trim()));
  if (!parentCode) {
    const classPrefix: Record<string, number> = {
      ASSET: 1, LIABILITY: 2, EQUITY: 3, REVENUE: 4, OTHER_INCOME: 4, DIRECT_COST: 5, OPERATING_EXPENSE: 5, OTHER_EXPENSE: 5,
    };
    let c = classPrefix[accountClass || 'ASSET'] ?? 1;
    while (existingSet.has(String(c))) c++;
    return String(c);
  }
  const cleanP = parentCode.trim();
  const numericSibs = existingSiblingCodes
    .map((c) => String(c).trim())
    .filter((c) => c.startsWith(cleanP) && /^\d+$/.test(c.slice(cleanP.length)) && c.length > cleanP.length);
  if (numericSibs.length > 0) {
    const pad = Math.max(...numericSibs.map((c) => c.length - cleanP.length));
    let next = Math.max(...numericSibs.map((c) => parseInt(c.slice(cleanP.length), 10))) + 1;
    while (existingSet.has(`${cleanP}${String(next).padStart(pad, '0')}`)) next++;
    return `${cleanP}${String(next).padStart(pad, '0')}`;
  }
  const pad = cleanP.length <= 1 ? 1 : 2;
  let next = 1;
  while (existingSet.has(`${cleanP}${String(next).padStart(pad, '0')}`)) next++;
  return `${cleanP}${String(next).padStart(pad, '0')}`;
}

export function getStatementLines(statementType?: string): any[] {
  const raw = getEntityList<any>('statement_lines', defaultStatementLinesList);
  const byCode = new Map(raw.map((s) => [s.code, s]));
  const merged = [...raw];
  for (const d of defaultStatementLinesList) {
    if (!byCode.has(d.code)) merged.push(d);
  }
  const filtered = statementType ? merged.filter((s) => s.statementType === statementType) : merged;
  return filtered.sort((a, b) => String(a.statementType).localeCompare(String(b.statementType)) || Number(a.sortOrder || 100) - Number(b.sortOrder || 100));
}

export function getReclassifications(accountId?: string): any[] {
  const list = getEntityList<any>('account_reclassifications', []);
  const filtered = accountId ? list.filter((r) => r.accountId === accountId) : list;
  return [...filtered].sort((a, b) => String(b.changedAt || '').localeCompare(String(a.changedAt || '')));
}

export function resolveLocalEffectiveClassification(
  acc: any,
  asOfDate: string,
  reclassifications: any[],
): {
  statementSection: AccountStatementSection;
  statementLineId: string | null;
  equityLineId: string | null;
  cashFlowCategory: CashFlowCategory;
} {
  let statementSection = acc.statementSection;
  let statementLineId = acc.statementLineId;
  let equityLineId = acc.equityLineId;
  let cashFlowCategory = acc.cashFlowCategory;

  const future = reclassifications
    .filter((r) => r.accountId === acc.id && String(r.effectiveFrom) > asOfDate)
    .sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)) || String(b.changedAt || '').localeCompare(String(a.changedAt || '')));

  for (const ch of future) {
    if (ch.oldStatementSection !== undefined) statementSection = ch.oldStatementSection;
    if (ch.oldStatementLineId !== undefined) statementLineId = ch.oldStatementLineId;
    if (ch.oldEquityLineId !== undefined) equityLineId = ch.oldEquityLineId;
    if (ch.oldCashFlowCategory !== undefined) cashFlowCategory = ch.oldCashFlowCategory;
  }

  return {
    statementSection: inferLocalStatementSection({ ...acc, statementSection }),
    statementLineId: statementLineId ?? null,
    equityLineId: equityLineId ?? null,
    cashFlowCategory: inferLocalCashFlowCategory({ ...acc, statementSection, cashFlowCategory }),
  };
}

function calcVar(cur: number, prev: number) {
  const variance = cur - prev;
  const variancePct = Math.abs(prev) < 0.005
    ? (Math.abs(cur) < 0.005 ? '0.0' : '100.0')
    : ((variance / Math.abs(prev)) * 100).toFixed(1);
  return {
    previousAmount: prev.toFixed(2),
    variance: variance.toFixed(2),
    variancePct,
  };
}

// ---------------------------------------------------------------------------
// 4. Hierarchical Account Enrichment & Rolled-Up Balances
// ---------------------------------------------------------------------------
export function buildEnrichedAccountsTree(
  baseAccounts: any[],
  postedJournals: any[],
  opts: { asOf?: string } = {},
): any[] {
  const slList = getStatementLines();
  const slById = new Map(slList.map((s) => [s.id, s]));
  const slBySection = new Map<string, any>();
  for (const s of slList) {
    if ((s.statementType === 'BALANCE_SHEET' || s.statementType === 'INCOME_STATEMENT') && !slBySection.has(s.sectionCode)) {
      slBySection.set(s.sectionCode, s);
    }
  }

  // Merge header accounts if missing, preserving all user-created accounts
  const byId = new Map<string, any>();
  const byCode = new Map<string, any>();
  for (const a of baseAccounts) {
    byId.set(a.id, a);
    byCode.set(a.code, a);
  }
  const merged = [...baseAccounts];
  for (const h of defaultHeaderAccountsList) {
    if (!byId.has(h.id) && !byCode.has(h.code)) {
      merged.push({ ...h });
      byId.set(h.id, h);
      byCode.set(h.code, h);
    }
  }

  // Normalize parent links + classification fields
  const pre = merged.map((a) => {
    let accountClass = a.accountClass;
    if (accountClass === 'EXPENSE') {
      if (a.code === '50101' || a.code === '50201') accountClass = 'DIRECT_COST';
      else if (a.code === '5700') accountClass = 'OTHER_EXPENSE';
      else accountClass = 'OPERATING_EXPENSE';
    }
    const defaultMeta = DEFAULT_POSTING_ACCOUNT_META[String(a.code || '')];
    const isPosting = a.isPosting !== false;
    let parentId = a.parentId ?? null;
    if (parentId === '' || parentId === undefined) parentId = null;
    if (parentId === null && isPosting && defaultMeta && byId.has(defaultMeta.parentId)) {
      parentId = defaultMeta.parentId;
    }

    const statementSection = inferLocalStatementSection({ ...a, accountClass });
    const statementLineId = a.statementLineId || defaultMeta?.statementLineId || slBySection.get(statementSection)?.id || null;
    const equityLineId = a.equityLineId || defaultMeta?.equityLineId || null;
    const cashFlowCategory = inferLocalCashFlowCategory({ ...a, accountClass, statementSection });
    const isContra = Boolean(a.isContra ?? defaultMeta?.isContra ?? (a.subtype === 'ACCUMULATED_DEPRECIATION' || a.code === '10502'));
    const baseNormal = NORMAL_BALANCE_BY_CLASS[accountClass] || 'DEBIT';
    const normalBalance = isContra ? (baseNormal === 'DEBIT' ? 'CREDIT' : 'DEBIT') : (a.normalBalance || baseNormal);

    return {
      ...a,
      accountClass,
      parentId,
      isPosting,
      isContra,
      isControl: Boolean(a.isControl),
      isActive: a.isActive !== false,
      subtype: a.subtype ?? defaultMeta?.subtype ?? null,
      normalBalance,
      statementSection,
      statementLineId,
      equityLineId,
      cashFlowCategory,
      currency: a.currencyCode || a.currency || 'SAR',
      currencyCode: a.currencyCode || a.currency || 'SAR',
      rowVersion: a.rowVersion || 1,
    };
  });

  const preById = new Map(pre.map((a) => [a.id, a]));
  const preByCode = new Map(pre.map((a) => [a.code, a]));

  // Compute exact dynamic tree depth (level) & children counts
  const childrenCountMap = new Map<string, number>();
  for (const a of pre) {
    if (a.parentId && preById.has(a.parentId)) {
      childrenCountMap.set(a.parentId, (childrenCountMap.get(a.parentId) || 0) + 1);
    }
  }

  const computeLevel = (acc: any): number => {
    let lvl = 1;
    let cur = acc.parentId;
    const seen = new Set<string>([acc.id]);
    while (cur && preById.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      lvl++;
      cur = preById.get(cur)!.parentId;
    }
    return lvl;
  };

  // Compute leaf sums from ALL journal entries (for hasTransactions) and POSTED entries (for balances)
  const allJes = getEntityList<any>('journal_entries', []);
  const touchedAccounts = new Set<string>();
  for (const je of allJes) {
    for (const l of (je.lines || [])) {
      const target = preById.get(l.accountId) || preByCode.get(l.accountCode);
      if (target) touchedAccounts.add(target.id);
    }
  }

  const leafBase = new Map<string, { dr: number; cr: number }>();
  const leafTx = new Map<string, { dr: number; cr: number }>();
  for (const je of postedJournals) {
    if (je.status !== 'POSTED') continue;
    if (opts.asOf && String(je.entryDate || '') > opts.asOf) continue;
    for (const l of (je.lines || [])) {
      const target = preById.get(l.accountId) || preByCode.get(l.accountCode);
      if (!target) continue;
      const dB = Number(l.debitBase ?? l.debit ?? 0);
      const cB = Number(l.creditBase ?? l.credit ?? 0);
      const dT = Number(l.debitTx ?? l.debit ?? dB);
      const cT = Number(l.creditTx ?? l.credit ?? cB);
      const pb = leafBase.get(target.id) || { dr: 0, cr: 0 };
      leafBase.set(target.id, { dr: pb.dr + dB, cr: pb.cr + cB });
      const pt = leafTx.get(target.id) || { dr: 0, cr: 0 };
      leafTx.set(target.id, { dr: pt.dr + dT, cr: pt.cr + cT });
    }
  }

  // Roll up leaf posted balances through all ancestors cleanly (zero double-counting!)
  const rolledBase = new Map<string, { dr: number; cr: number }>();
  for (const a of pre) rolledBase.set(a.id, { dr: 0, cr: 0 });
  for (const [leafId, sum] of leafBase.entries()) {
    let cur: string | null = leafId;
    const seen = new Set<string>();
    while (cur && preById.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      const b = rolledBase.get(cur)!;
      b.dr += sum.dr;
      b.cr += sum.cr;
      cur = preById.get(cur)!.parentId;
    }
  }

  const baseCur = getStoredCompany().baseCurrency || 'SAR';
  const enriched = pre.map((a) => {
    const b = rolledBase.get(a.id) || { dr: 0, cr: 0 };
    const t = leafTx.get(a.id) || { dr: 0, cr: 0 };
    const isCr = a.normalBalance === 'CREDIT';
    const netBase = isCr ? (b.cr - b.dr) : (b.dr - b.cr);
    const netTx = isCr ? (t.cr - t.dr) : (t.dr - t.cr);
    const displayBal = a.isPosting && a.currencyCode !== baseCur && (t.dr > 0 || t.cr > 0) ? netTx : netBase;
    const sl = a.statementLineId ? slById.get(a.statementLineId) : null;
    const el = a.equityLineId ? slById.get(a.equityLineId) : null;
    const parent = a.parentId ? preById.get(a.parentId) : null;
    const childrenCount = childrenCountMap.get(a.id) || 0;

    return {
      ...a,
      level: computeLevel(a),
      parentCode: parent?.code || null,
      parentNameAr: parent?.nameAr || null,
      statementLineCode: sl?.code || null,
      statementLineNameAr: sl?.nameAr || null,
      equityLineCode: el?.code || null,
      equityLineNameAr: el?.nameAr || null,
      hasChildren: childrenCount > 0,
      childrenCount,
      hasTransactions: touchedAccounts.has(a.id),
      debitBase: b.dr.toFixed(2),
      creditBase: b.cr.toFixed(2),
      currentBalance: displayBal.toFixed(2),
      currentBalanceBase: netBase.toFixed(2),
    };
  });

  // Depth-first tree ordering by code
  const childrenOf = new Map<string | null, any[]>();
  for (const a of enriched) {
    const pid = a.parentId && preById.has(a.parentId) ? a.parentId : null;
    const list = childrenOf.get(pid) || [];
    list.push(a);
    childrenOf.set(pid, list);
  }
  const ordered: any[] = [];
  const walk = (pid: string | null) => {
    const kids = (childrenOf.get(pid) || []).sort((x, y) => String(x.code).localeCompare(String(y.code), undefined, { numeric: true }));
    for (const k of kids) {
      ordered.push(k);
      walk(k.id);
    }
  };
  walk(null);
  return ordered;
}

// ---------------------------------------------------------------------------
// 5. Local COA Mutations (Create / Update / Move / Reclassify / Delete)
// ---------------------------------------------------------------------------
function ensureLocalAccountsSeeded(baseList: any[]) {
  const existing = getEntityList<any>('accounts', []);
  if (existing.length > 0) return existing;
  // Seed headers + base accounts
  const seeded = [...defaultHeaderAccountsList, ...baseList.map((a) => {
    const m = DEFAULT_POSTING_ACCOUNT_META[a.code];
    return m ? { ...a, ...m } : a;
  })];
  for (const item of seeded) saveEntityItem('accounts', item);
  return seeded;
}

export function createLocalAccount(body: any, allAccounts: any[]): any {
  ensureLocalAccountsSeeded(allAccounts);
  const code = String(body.code || '').trim();
  const nameAr = String(body.nameAr || '').trim();
  if (!code) throw new Error('يرجى إدخال كود الحساب');
  if (!nameAr) throw new Error('يرجى إدخال اسم الحساب بالعربية');
  if (allAccounts.some((a) => String(a.code).toLowerCase() === code.toLowerCase())) {
    throw new Error(`كود الحساب (${code}) مستخدم بالفعل في شجرة الحسابات`);
  }

  let accountClass = body.accountClass || 'ASSET';
  let parentId = body.parentId || null;
  let level = 1;
  if (parentId) {
    const parent = allAccounts.find((a) => a.id === parentId);
    if (!parent) throw new Error('الحساب الأب غير موجود');
    if (parent.isPosting) throw new Error('لا يمكن إضافة حساب فرعي تحت حساب تفصيلي (قابل للترحيل) — اختر حساباً رئيسياً تجميعياً');
    accountClass = parent.accountClass;
    level = Number(parent.level || 1) + 1;
  }

  const isPosting = body.isPosting !== false;
  if (body.isControl && !isPosting) throw new Error('الحساب الرقابي يجب أن يكون حساباً تفصيلياً قابلاً للترحيل');
  const isContra = Boolean(body.isContra);
  const baseNormal = NORMAL_BALANCE_BY_CLASS[accountClass] || 'DEBIT';
  const normalBalance = isContra ? (baseNormal === 'DEBIT' ? 'CREDIT' : 'DEBIT') : baseNormal;

  const statementSection = body.statementSection || inferLocalStatementSection({ ...body, accountClass });
  const slList = getStatementLines();
  const statementLineId =
    body.statementLineId ||
    slList.find((s) => s.sectionCode === statementSection && (s.statementType === 'BALANCE_SHEET' || s.statementType === 'INCOME_STATEMENT'))?.id ||
    null;
  const cashFlowCategory = body.cashFlowCategory || inferLocalCashFlowCategory({ ...body, accountClass, statementSection });
  const equityLineId =
    body.equityLineId ||
    (accountClass === 'EQUITY' ? slList.find((s) => s.statementType === 'EQUITY_CHANGES' && s.sectionCode === inferLocalEquitySection(body))?.id || 'sl-eq-oth' : null);

  const created = {
    id: body.id || uid('acc'),
    parentId,
    code,
    nameAr,
    nameEn: body.nameEn || null,
    accountClass,
    subtype: body.subtype || null,
    normalBalance,
    isContra,
    currencyCode: body.currencyCode || 'SAR',
    currency: body.currencyCode || 'SAR',
    isPosting,
    isControl: Boolean(body.isControl),
    isActive: body.isActive !== false,
    cashFlowCategory,
    statementSection,
    statementLineId,
    equityLineId,
    requiresCostCenter: Boolean(body.requiresCostCenter),
    requiresProject: Boolean(body.requiresProject),
    requiresEmployee: Boolean(body.requiresEmployee),
    level,
    description: body.description || null,
    rowVersion: 1,
    createdAt: new Date().toISOString(),
  };

  saveEntityItem('accounts', created);
  recordAudit({ action: 'INSERT', schemaName: 'acc', tableName: 'accounts', entityId: created.id, newValues: created, reason: `إضافة حساب جديد ${code} — ${nameAr}` });
  return created;
}

export function updateLocalAccount(id: string, body: any, allAccounts: any[]): any {
  ensureLocalAccountsSeeded(allAccounts);
  const existing = allAccounts.find((a) => a.id === id);
  if (!existing) throw new Error('الحساب غير موجود');

  const nextCode = body.code !== undefined ? String(body.code).trim() : existing.code;
  if (nextCode !== existing.code && allAccounts.some((a) => a.id !== id && String(a.code).toLowerCase() === nextCode.toLowerCase())) {
    throw new Error(`كود الحساب (${nextCode}) مستخدم بالفعل`);
  }

  const nextIsPosting = body.isPosting !== undefined ? Boolean(body.isPosting) : existing.isPosting;
  if (existing.isPosting && !nextIsPosting && existing.hasTransactions) {
    throw new Error('لا يمكن تحويل حساب تفصيلي يحتوي على حركات محاسبية إلى حساب رئيسي تجميعي');
  }
  if (!existing.isPosting && nextIsPosting && existing.hasChildren) {
    throw new Error('لا يمكن تحويل حساب رئيسي يحتوي على حسابات فرعية إلى حساب تفصيلي');
  }

  const nextParentId = body.parentId !== undefined ? (body.parentId || null) : existing.parentId;
  if (nextParentId !== existing.parentId) {
    assertSafeMove(id, nextParentId, allAccounts);
  }

  const nextClass = body.accountClass !== undefined ? body.accountClass : existing.accountClass;
  if (nextClass !== existing.accountClass && (existing.hasTransactions || existing.hasChildren)) {
    throw new Error('لا يمكن تغيير التصنيف المحاسبي الأساسي لحساب عليه حركات أو حسابات فرعية');
  }

  const nextContra = body.isContra !== undefined ? Boolean(body.isContra) : Boolean(existing.isContra);
  const baseNormal = NORMAL_BALANCE_BY_CLASS[nextClass] || 'DEBIT';
  const normalBalance = nextContra ? (baseNormal === 'DEBIT' ? 'CREDIT' : 'DEBIT') : baseNormal;

  const nextSection = body.statementSection !== undefined ? (body.statementSection || inferLocalStatementSection({ ...existing, ...body, accountClass: nextClass })) : existing.statementSection;
  const slList = getStatementLines();
  let nextSlId = body.statementLineId !== undefined ? body.statementLineId : existing.statementLineId;
  if (body.statementSection !== undefined && body.statementLineId === undefined) {
    nextSlId = slList.find((s) => s.sectionCode === nextSection && (s.statementType === 'BALANCE_SHEET' || s.statementType === 'INCOME_STATEMENT'))?.id || nextSlId;
  }

  const updated = {
    ...existing,
    ...body,
    id,
    code: nextCode,
    parentId: nextParentId,
    accountClass: nextClass,
    isPosting: nextIsPosting,
    isContra: nextContra,
    normalBalance,
    statementSection: nextSection,
    statementLineId: nextSlId,
    currency: body.currencyCode || existing.currencyCode || 'SAR',
    currencyCode: body.currencyCode || existing.currencyCode || 'SAR',
    rowVersion: (existing.rowVersion || 1) + 1,
    updatedAt: new Date().toISOString(),
  };

  saveEntityItem('accounts', updated);
  recordAudit({ action: 'UPDATE', schemaName: 'acc', tableName: 'accounts', entityId: id, oldValues: existing, newValues: updated, reason: `تعديل بيانات الحساب ${updated.code}` });
  return updated;
}

function assertSafeMove(accountId: string, newParentId: string | null, allAccounts: any[]) {
  if (!newParentId) return;
  if (newParentId === accountId) throw new Error('لا يمكن نقل الحساب تحت نفسه');
  const acc = allAccounts.find((a) => a.id === accountId);
  const target = allAccounts.find((a) => a.id === newParentId);
  if (!target) throw new Error('الحساب الأب المستهدف غير موجود');
  if (target.isPosting) throw new Error('الحساب الأب المستهدف يجب أن يكون حساباً رئيسياً (تجميعياً) وليس فرعياً');
  if (acc && target.accountClass !== acc.accountClass) {
    throw new Error('لا يمكن نقل الحساب إلى فئة محاسبية مختلفة عن فئته الأصلية حفاظاً على سلامة القوائم المالية');
  }
  // Cycle check: walk up from target
  let cur: string | null = target.parentId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    if (cur === accountId) throw new Error('لا يمكن نقل حساب رئيسي تحت أحد فروعه التابعة (حلقة دائرية)');
    seen.add(cur);
    cur = allAccounts.find((a) => a.id === cur)?.parentId ?? null;
  }
}

export function moveLocalAccount(id: string, body: { newParentId: string | null; newCode?: string; reason?: string }, allAccounts: any[]): any {
  ensureLocalAccountsSeeded(allAccounts);
  const existing = allAccounts.find((a) => a.id === id);
  if (!existing) throw new Error('الحساب غير موجود');
  assertSafeMove(id, body.newParentId, allAccounts);
  const nextCode = body.newCode?.trim() || existing.code;
  if (nextCode !== existing.code && allAccounts.some((a) => a.id !== id && String(a.code).toLowerCase() === nextCode.toLowerCase())) {
    throw new Error(`كود الحساب الجديد (${nextCode}) مستخدم بالفعل`);
  }
  const updated = { ...existing, parentId: body.newParentId, code: nextCode, rowVersion: (existing.rowVersion || 1) + 1, updatedAt: new Date().toISOString() };
  saveEntityItem('accounts', updated);
  recordAudit({
    action: 'UPDATE',
    schemaName: 'acc',
    tableName: 'accounts',
    entityId: id,
    oldValues: { parentId: existing.parentId, code: existing.code },
    newValues: { parentId: body.newParentId, code: nextCode },
    reason: body.reason || `نقل الحساب ${existing.code} داخل الشجرة`,
  });
  return updated;
}

export function reclassifyLocalAccount(
  id: string,
  body: { statementSection?: string | null; statementLineId?: string | null; equityLineId?: string | null; cashFlowCategory?: string | null; effectiveFrom?: string; reason: string },
  allAccounts: any[],
): any {
  ensureLocalAccountsSeeded(allAccounts);
  const existing = allAccounts.find((a) => a.id === id);
  if (!existing) throw new Error('الحساب غير موجود');
  if (!body.reason || body.reason.trim().length < 3) throw new Error('يرجى إدخال مبرر محاسبي لتعديل تصنيف الحساب (3 أحرف على الأقل)');

  const slList = getStatementLines();
  let nextSection = body.statementSection !== undefined ? body.statementSection : existing.statementSection;
  let nextSlId = body.statementLineId !== undefined ? body.statementLineId : existing.statementLineId;
  if (body.statementLineId && body.statementSection === undefined) {
    const sl = slList.find((s) => s.id === body.statementLineId);
    if (sl) nextSection = sl.sectionCode;
  } else if (body.statementSection && body.statementLineId === undefined) {
    nextSlId = slList.find((s) => s.sectionCode === body.statementSection && (s.statementType === 'BALANCE_SHEET' || s.statementType === 'INCOME_STATEMENT'))?.id || nextSlId;
  }

  const nextEquityLineId = body.equityLineId !== undefined ? body.equityLineId : existing.equityLineId;
  const nextCf = body.cashFlowCategory !== undefined ? body.cashFlowCategory : existing.cashFlowCategory;
  const effectiveFrom = body.effectiveFrom || new Date().toISOString().slice(0, 10);

  const rec = {
    id: uid('reclass'),
    accountId: id,
    accountCode: existing.code,
    accountNameAr: existing.nameAr,
    effectiveFrom,
    oldStatementSection: existing.statementSection ?? null,
    newStatementSection: nextSection ?? null,
    oldStatementLineId: existing.statementLineId ?? null,
    newStatementLineId: nextSlId ?? null,
    oldEquityLineId: existing.equityLineId ?? null,
    newEquityLineId: nextEquityLineId ?? null,
    oldCashFlowCategory: existing.cashFlowCategory ?? null,
    newCashFlowCategory: nextCf ?? null,
    reason: body.reason.trim(),
    changedAt: new Date().toISOString(),
  };
  saveEntityItem('account_reclassifications', rec);

  const updated = {
    ...existing,
    statementSection: nextSection,
    statementLineId: nextSlId,
    equityLineId: nextEquityLineId,
    cashFlowCategory: nextCf,
    rowVersion: (existing.rowVersion || 1) + 1,
    updatedAt: new Date().toISOString(),
  };
  saveEntityItem('accounts', updated);
  recordAudit({ action: 'UPDATE', schemaName: 'acc', tableName: 'account_reclassifications', entityId: id, oldValues: existing, newValues: updated, reason: body.reason.trim() });
  return updated;
}

export function deleteLocalAccount(id: string, allAccounts: any[]) {
  ensureLocalAccountsSeeded(allAccounts);
  const acc = allAccounts.find((a) => a.id === id);
  if (!acc) throw new Error('الحساب غير موجود');
  if (acc.hasTransactions) throw new Error('لا يمكن حذف حساب مرتبط بحركات أو قيود محاسبية — يمكنك تعطيله بدلاً من الحذف');
  if (acc.hasChildren) throw new Error('لا يمكن حذف حساب رئيسي يحتوي على حسابات فرعية تابعة');
  const banks = getEntityList<any>('bank_accounts', []);
  if (banks.some((b) => b.glAccountId === id || b.glAccountCode === acc.code)) {
    throw new Error('لا يمكن حذف حساب مرتبط بحساب بنكي أو صندوق نقدي');
  }
  deleteEntityItem('accounts', id);
  recordAudit({ action: 'DELETE', schemaName: 'acc', tableName: 'accounts', entityId: id, oldValues: acc, reason: `حذف الحساب ${acc.code} — ${acc.nameAr}` });
  return { deleted: true };
}

// ---------------------------------------------------------------------------
// 6. Dynamic Financial Statements Engine (All 4 Statements + Trial Balance + Ledger)
// ---------------------------------------------------------------------------
export function computeDynamicTrialBalance(
  accounts: any[],
  postedJournals: any[],
  params: { from?: string; to?: string; ledger?: string; includeZero?: boolean } & DimensionFilterParams = {},
) {
  const from = params.from || `${new Date().getFullYear()}-01-01`;
  const to = params.to || new Date().toISOString().slice(0, 10);
  const ledger = params.ledger || 'FINANCIAL';
  const dimMatch = createLineDimMatcher(params);

  const byId = new Map(accounts.map((a) => [a.id, a]));
  const byCode = new Map(accounts.map((a) => [a.code, a]));

  // Aggregate ONLY posting leaves first
  const leafAgg = new Map<string, { opening: number; pd: number; pc: number }>();
  for (const je of postedJournals) {
    if (je.status !== 'POSTED') continue;
    if (ledger && ledger !== 'ALL' && je.ledger && je.ledger !== ledger) continue;
    if (String(je.entryDate) > to) continue;
    const isOpening = String(je.entryDate) < from;
    for (const l of (je.lines || [])) {
      if (!dimMatch(l)) continue;
      const acc = byId.get(l.accountId) || byCode.get(l.accountCode);
      if (!acc) continue;
      const prev = leafAgg.get(acc.id) || { opening: 0, pd: 0, pc: 0 };
      const dr = Number(l.debitBase || 0);
      const cr = Number(l.creditBase || 0);
      if (isOpening) prev.opening += dr - cr;
      else {
        prev.pd += dr;
        prev.pc += cr;
      }
      leafAgg.set(acc.id, prev);
    }
  }

  // Roll up through ancestors for hierarchical display
  const rolled = new Map<string, { opening: number; pd: number; pc: number }>();
  for (const a of accounts) rolled.set(a.id, { opening: 0, pd: 0, pc: 0 });
  for (const [leafId, sum] of leafAgg.entries()) {
    let cur: string | null = leafId;
    const seen = new Set<string>();
    while (cur && byId.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      const b = rolled.get(cur)!;
      b.opening += sum.opening;
      b.pd += sum.pd;
      b.pc += sum.pc;
      cur = byId.get(cur)!.parentId ?? null;
    }
  }

  const totals = { openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: 0, closingDebit: 0, closingCredit: 0 };
  const rows: any[] = [];

  for (const a of accounts) {
    const t = rolled.get(a.id)!;
    const closing = t.opening + t.pd - t.pc;
    if (!params.includeZero && Math.abs(t.opening) < 0.005 && Math.abs(t.pd) < 0.005 && Math.abs(t.pc) < 0.005) continue;
    const oDr = t.opening > 0 ? t.opening : 0;
    const oCr = t.opening < 0 ? -t.opening : 0;
    const cDr = closing > 0 ? closing : 0;
    const cCr = closing < 0 ? -closing : 0;

    // ZERO double-counting: ONLY posting leaves contribute to grand totals
    if (a.isPosting) {
      totals.openingDebit += oDr;
      totals.openingCredit += oCr;
      totals.periodDebit += t.pd;
      totals.periodCredit += t.pc;
      totals.closingDebit += cDr;
      totals.closingCredit += cCr;
    }

    rows.push({
      accountId: a.id,
      parentId: a.parentId,
      code: a.code,
      nameAr: a.nameAr,
      nameEn: a.nameEn || null,
      accountClass: a.accountClass,
      statementSection: a.statementSection,
      normalBalance: a.normalBalance,
      level: a.level || 1,
      isPosting: a.isPosting,
      openingDebit: oDr.toFixed(2),
      openingCredit: oCr.toFixed(2),
      periodDebit: t.pd.toFixed(2),
      periodCredit: t.pc.toFixed(2),
      closingDebit: cDr.toFixed(2),
      closingCredit: cCr.toFixed(2),
    });
  }

  const balanced = Math.abs(totals.closingDebit - totals.closingCredit) < 0.01 && Math.abs(totals.periodDebit - totals.periodCredit) < 0.01;
  const formattedTotals = {
    openingDebit: totals.openingDebit.toFixed(2),
    openingCredit: totals.openingCredit.toFixed(2),
    periodDebit: totals.periodDebit.toFixed(2),
    periodCredit: totals.periodCredit.toFixed(2),
    closingDebit: totals.closingDebit.toFixed(2),
    closingCredit: totals.closingCredit.toFixed(2),
  };

  return {
    period: `${from} — ${to}`,
    totalDebit: formattedTotals.closingDebit,
    totalCredit: formattedTotals.closingCredit,
    balanced,
    isBalanced: balanced,
    rows,
    lines: rows,
    totals: formattedTotals,
  };
}

export function computeDynamicAccountStatement(
  accounts: any[],
  postedJournals: any[],
  params: { accountId?: string; from?: string; to?: string; ledger?: string } & DimensionFilterParams,
) {
  const from = params.from || `${new Date().getFullYear()}-01-01`;
  const to = params.to || new Date().toISOString().slice(0, 10);
  const ledger = params.ledger || '';
  const dimMatch = createLineDimMatcher(params);
  const dimResolve = createLineDimResolver();
  const acc = accounts.find((a) => a.id === params.accountId || a.code === params.accountId) || accounts[0];
  if (!acc) {
    return { account: null, openingBalance: '0.00', closingBalance: '0.00', periodDebit: '0.00', periodCredit: '0.00', lines: [], data: [], meta: { page: 1, pageSize: 100, total: 0 } };
  }

  // Include descendant posting accounts when viewing a header account!
  const includedIds = new Set<string>([acc.id]);
  const includedCodes = new Set<string>([acc.code]);
  if (!acc.isPosting) {
    let added = true;
    while (added) {
      added = false;
      for (const a of accounts) {
        if (a.parentId && includedIds.has(a.parentId) && !includedIds.has(a.id)) {
          includedIds.add(a.id);
          includedCodes.add(a.code);
          added = true;
        }
      }
    }
  }

  const isDebitNormal = acc.normalBalance !== 'CREDIT';
  const sortedJes = [...postedJournals]
    .filter((j) => j.status === 'POSTED' && (!ledger || ledger === 'ALL' || !j.ledger || j.ledger === ledger))
    .sort((a, b) => String(a.entryDate).localeCompare(String(b.entryDate)) || String(a.entryNo || '').localeCompare(String(b.entryNo || '')));

  let opening = 0;
  let periodDebit = 0;
  let periodCredit = 0;
  const statementLines: any[] = [];
  const baseCur = getStoredCompany().baseCurrency || 'SAR';

  for (const je of sortedJes) {
    if (String(je.entryDate) > to) continue;
    for (const l of (je.lines || [])) {
      if (!dimMatch(l)) continue;
      if (!includedIds.has(l.accountId) && !includedCodes.has(l.accountCode)) continue;
      const dr = Number(l.debitBase || 0);
      const cr = Number(l.creditBase || 0);
      const delta = isDebitNormal ? (dr - cr) : (cr - dr);
      if (String(je.entryDate) < from) {
        opening += delta;
      } else {
        periodDebit += dr;
        periodCredit += cr;
        const running = opening + (isDebitNormal ? (periodDebit - periodCredit) : (periodCredit - periodDebit));
        const d = dimResolve(l);
        statementLines.push({
          entryId: je.id,
          entryNo: je.entryNo,
          entryDate: je.entryDate,
          journalType: je.journalType,
          accountCode: l.accountCode || acc.code,
          accountNameAr: l.accountNameAr || acc.nameAr,
          lineDescription: l.description || je.description,
          description: je.description,
          currencyCode: l.currencyCode || acc.currencyCode || baseCur,
          debitTx: l.debitTx ?? l.debitBase,
          creditTx: l.creditTx ?? l.creditBase,
          debitBase: l.debitBase,
          creditBase: l.creditBase,
          runningBalance: running.toFixed(2),
          projectId: d.projectId,
          projectName: d.projectName,
          clientId: d.clientId,
          clientName: d.clientName,
          employeeId: d.employeeId,
          employeeName: d.employeeName,
          costCenterId: d.costCenterId,
          costCenterCode: d.costCenterCode,
          costCenterName: d.costCenterName,
          branchId: d.branchId,
          departmentId: d.departmentId,
        });
      }
    }
  }

  const closing = opening + (isDebitNormal ? (periodDebit - periodCredit) : (periodCredit - periodDebit));
  return {
    account: acc,
    openingBalance: opening.toFixed(2),
    closingBalance: closing.toFixed(2),
    periodDebit: periodDebit.toFixed(2),
    periodCredit: periodCredit.toFixed(2),
    totalDebit: periodDebit.toFixed(2),
    totalCredit: periodCredit.toFixed(2),
    lines: statementLines,
    data: statementLines,
    meta: { page: 1, pageSize: 100, total: statementLines.length },
  };
}

function computeSingleLocalIncomeStatement(
  accounts: any[],
  postedJournals: any[],
  statementLines: any[],
  reclassifications: any[],
  params: { from: string; to: string } & DimensionFilterParams,
) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const dimMatch = createLineDimMatcher(params);

  const sums = new Map<string, { dr: number; cr: number }>();
  for (const je of postedJournals) {
    if (je.status !== 'POSTED' || je.journalType === 'CLOSING') continue;
    if (params.ledger && params.ledger !== 'ALL' && je.ledger && je.ledger !== params.ledger) continue;
    if (String(je.entryDate) < params.from || String(je.entryDate) > params.to) continue;
    for (const l of (je.lines || [])) {
      if (!dimMatch(l)) continue;
      const acc = byId.get(l.accountId) || byCode.get(l.accountCode);
      if (!acc || !acc.isPosting) continue;
      const prev = sums.get(acc.id) || { dr: 0, cr: 0 };
      prev.dr += Number(l.debitBase || 0);
      prev.cr += Number(l.creditBase || 0);
      sums.set(acc.id, prev);
    }
  }

  const buckets = new Map<string, any>();
  for (const sl of statementLines.filter((s) => s.statementType === 'INCOME_STATEMENT' && s.isActive !== false)) {
    buckets.set(sl.id, {
      sectionCode: sl.sectionCode,
      statementLineId: sl.id,
      code: sl.code,
      nameAr: sl.nameAr,
      nameEn: sl.nameEn || sl.sectionCode,
      sortOrder: sl.sortOrder || 100,
      totalNum: 0,
      accounts: [],
    });
  }

  const secTotals: Record<string, number> = {
    REVENUE: 0, COST_OF_SALES: 0, OPERATING_EXPENSES: 0, OTHER_INCOME: 0, OTHER_EXPENSES: 0, ZAKAT_TAX: 0,
  };
  const flatLines: any[] = [];

  for (const [accId, s] of sums.entries()) {
    const acc = byId.get(accId);
    if (!acc) continue;
    const eff = resolveLocalEffectiveClassification(acc, params.to, reclassifications);
    if (!IS_SECTIONS.has(eff.statementSection)) continue;

    const isCr = eff.statementSection === 'REVENUE' || eff.statementSection === 'OTHER_INCOME';
    const amt = isCr ? (s.cr - s.dr) : (s.dr - s.cr);
    if (Math.abs(amt) < 0.005) continue;

    secTotals[eff.statementSection] = (secTotals[eff.statementSection] || 0) + amt;

    let bucket = eff.statementLineId ? buckets.get(eff.statementLineId) : undefined;
    if (!bucket) bucket = Array.from(buckets.values()).find((b) => b.sectionCode === eff.statementSection);
    if (!bucket) {
      bucket = { sectionCode: eff.statementSection, statementLineId: null, code: eff.statementSection, nameAr: eff.statementSection, nameEn: eff.statementSection, sortOrder: 99, totalNum: 0, accounts: [] };
      buckets.set(eff.statementSection, bucket);
    }

    const row = {
      accountId: acc.id,
      code: acc.code,
      nameAr: acc.nameAr,
      accountClass: acc.accountClass,
      statementSection: eff.statementSection,
      statementLineId: bucket.statementLineId,
      statementLineNameAr: bucket.nameAr,
      debitBase: s.dr.toFixed(2),
      creditBase: s.cr.toFixed(2),
      amount: amt.toFixed(2),
    };
    bucket.totalNum += amt;
    bucket.accounts.push(row);
    flatLines.push(row);
  }

  flatLines.sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const sections = Array.from(buckets.values())
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((b) => ({
      sectionCode: b.sectionCode,
      statementLineId: b.statementLineId,
      code: b.code,
      nameAr: b.nameAr,
      nameEn: b.nameEn,
      sortOrder: b.sortOrder,
      total: b.totalNum.toFixed(2),
      accounts: b.accounts.sort((x: any, y: any) => String(x.code).localeCompare(String(y.code))),
    }));

  const revenue = secTotals.REVENUE;
  const directCost = secTotals.COST_OF_SALES;
  const grossProfit = revenue - directCost;
  const operatingExpenses = secTotals.OPERATING_EXPENSES;
  const operatingProfit = grossProfit - operatingExpenses;
  const otherIncome = secTotals.OTHER_INCOME;
  const otherExpenses = secTotals.OTHER_EXPENSES;
  const profitBeforeTax = operatingProfit + otherIncome - otherExpenses;
  const zakatTax = secTotals.ZAKAT_TAX;
  const netProfit = profitBeforeTax - zakatTax;
  const marginPct = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : '0.0';

  return {
    from: params.from,
    to: params.to,
    sections,
    lines: flatLines,
    revenue: revenue.toFixed(2),
    directCost: directCost.toFixed(2),
    grossProfit: grossProfit.toFixed(2),
    operatingExpenses: operatingExpenses.toFixed(2),
    operatingProfit: operatingProfit.toFixed(2),
    otherIncome: otherIncome.toFixed(2),
    otherExpenses: otherExpenses.toFixed(2),
    profitBeforeTax: profitBeforeTax.toFixed(2),
    zakatTax: zakatTax.toFixed(2),
    netProfit: netProfit.toFixed(2),
    marginPct,
  };
}

export function computeDynamicIncomeStatement(
  accounts: any[],
  postedJournals: any[],
  params: { from?: string; to?: string; compareFrom?: string; compareTo?: string } & DimensionFilterParams = {},
) {
  const from = params.from || `${new Date().getFullYear()}-01-01`;
  const to = params.to || new Date().toISOString().slice(0, 10);
  const slList = getStatementLines();
  const reclass = getReclassifications();
  const current = computeSingleLocalIncomeStatement(accounts, postedJournals, slList, reclass, { ...params, from, to });

  if (params.compareFrom && params.compareTo) {
    const prev = computeSingleLocalIncomeStatement(accounts, postedJournals, slList, reclass, { ...params, from: params.compareFrom, to: params.compareTo });
    const prevAcc = new Map(prev.lines.map((l: any) => [l.accountId, Number(l.amount)]));
    const prevSec = new Map(prev.sections.map((s: any) => [s.statementLineId || s.sectionCode, Number(s.total)]));
    return {
      ...current,
      sections: current.sections.map((s: any) => ({
        ...s,
        ...calcVar(Number(s.total), prevSec.get(s.statementLineId || s.sectionCode) || 0),
        accounts: s.accounts.map((a: any) => ({
          ...a,
          ...calcVar(Number(a.amount), prevAcc.get(a.accountId) || 0),
        })),
      })),
      comparative: {
        from: params.compareFrom,
        to: params.compareTo,
        revenue: calcVar(Number(current.revenue), Number(prev.revenue)),
        directCost: calcVar(Number(current.directCost), Number(prev.directCost)),
        grossProfit: calcVar(Number(current.grossProfit), Number(prev.grossProfit)),
        operatingExpenses: calcVar(Number(current.operatingExpenses), Number(prev.operatingExpenses)),
        operatingProfit: calcVar(Number(current.operatingProfit), Number(prev.operatingProfit)),
        otherIncome: calcVar(Number(current.otherIncome), Number(prev.otherIncome)),
        otherExpenses: calcVar(Number(current.otherExpenses), Number(prev.otherExpenses)),
        zakatTax: calcVar(Number(current.zakatTax), Number(prev.zakatTax)),
        netProfit: calcVar(Number(current.netProfit), Number(prev.netProfit)),
      },
    };
  }
  return current;
}

function computeSingleLocalBalanceSheet(
  accounts: any[],
  postedJournals: any[],
  statementLines: any[],
  reclassifications: any[],
  params: { asOf: string } & DimensionFilterParams,
) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const dimMatch = createLineDimMatcher(params);

  const sums = new Map<string, { dr: number; cr: number }>();
  for (const je of postedJournals) {
    if (je.status !== 'POSTED' || String(je.entryDate) > params.asOf) continue;
    if (params.ledger && params.ledger !== 'ALL' && je.ledger && je.ledger !== params.ledger) continue;
    for (const l of (je.lines || [])) {
      if (!dimMatch(l)) continue;
      const acc = byId.get(l.accountId) || byCode.get(l.accountCode);
      if (!acc || !acc.isPosting) continue;
      const prev = sums.get(acc.id) || { dr: 0, cr: 0 };
      prev.dr += Number(l.debitBase || 0);
      prev.cr += Number(l.creditBase || 0);
      sums.set(acc.id, prev);
    }
  }

  const buckets = new Map<string, any>();
  for (const sl of statementLines.filter((s) => s.statementType === 'BALANCE_SHEET' && s.isActive !== false)) {
    buckets.set(sl.id, {
      sectionCode: sl.sectionCode,
      statementLineId: sl.id,
      code: sl.code,
      nameAr: sl.nameAr,
      nameEn: sl.nameEn || sl.sectionCode,
      sortOrder: sl.sortOrder || 100,
      totalNum: 0,
      accounts: [],
    });
  }

  let curAssets = 0;
  let nonCurAssets = 0;
  let curLiab = 0;
  let nonCurLiab = 0;
  let eqTotal = 0;
  let currentEarnings = 0;
  const allAssetLines: any[] = [];
  const allLiabLines: any[] = [];
  const allEqLines: any[] = [];

  for (const [accId, s] of sums.entries()) {
    const acc = byId.get(accId);
    if (!acc) continue;
    const eff = resolveLocalEffectiveClassification(acc, params.asOf, reclassifications);

    if (IS_SECTIONS.has(eff.statementSection)) {
      currentEarnings += (s.cr - s.dr);
      continue;
    }

    const isAsset = eff.statementSection === 'CURRENT_ASSETS' || eff.statementSection === 'NON_CURRENT_ASSETS';
    const amt = isAsset ? (s.dr - s.cr) : (s.cr - s.dr);
    if (Math.abs(amt) < 0.005) continue;

    if (eff.statementSection === 'CURRENT_ASSETS') curAssets += amt;
    else if (eff.statementSection === 'NON_CURRENT_ASSETS') nonCurAssets += amt;
    else if (eff.statementSection === 'CURRENT_LIABILITIES') curLiab += amt;
    else if (eff.statementSection === 'NON_CURRENT_LIABILITIES') nonCurLiab += amt;
    else if (eff.statementSection === 'EQUITY') eqTotal += amt;

    let bucket = eff.statementLineId ? buckets.get(eff.statementLineId) : undefined;
    if (!bucket) bucket = Array.from(buckets.values()).find((b) => b.sectionCode === eff.statementSection);
    if (!bucket) {
      bucket = { sectionCode: eff.statementSection, statementLineId: null, code: eff.statementSection, nameAr: eff.statementSection, nameEn: eff.statementSection, sortOrder: 99, totalNum: 0, accounts: [] };
      buckets.set(eff.statementSection, bucket);
    }

    const item = {
      accountId: acc.id,
      code: acc.code,
      nameAr: acc.nameAr,
      accountClass: acc.accountClass,
      subtype: acc.subtype || null,
      statementSection: eff.statementSection,
      statementLineId: bucket.statementLineId,
      isContra: Boolean(acc.isContra),
      debitBase: s.dr.toFixed(2),
      creditBase: s.cr.toFixed(2),
      amount: amt.toFixed(2),
    };
    bucket.totalNum += amt;
    bucket.accounts.push(item);

    if (isAsset) allAssetLines.push(item);
    else if (eff.statementSection === 'EQUITY') allEqLines.push(item);
    else allLiabLines.push(item);
  }

  const totalAssets = curAssets + nonCurAssets;
  const totalLiab = curLiab + nonCurLiab;
  const totalEquityWithEarnings = eqTotal + currentEarnings;
  const liabAndEq = totalLiab + totalEquityWithEarnings;
  const diff = totalAssets - liabAndEq;
  const balanced = Math.abs(diff) < 0.01;

  const sections = Array.from(buckets.values())
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((b) => ({
      sectionCode: b.sectionCode,
      statementLineId: b.statementLineId,
      code: b.code,
      nameAr: b.nameAr,
      nameEn: b.nameEn,
      sortOrder: b.sortOrder,
      total: b.totalNum.toFixed(2),
      accounts: b.accounts.sort((x: any, y: any) => String(x.code).localeCompare(String(y.code))),
    }));

  const pickLines = (secCode: string) => sections.filter((s) => s.sectionCode === secCode).flatMap((s) => s.accounts);

  return {
    asOf: params.asOf,
    asOfDate: params.asOf,
    balanced,
    isBalanced: balanced,
    difference: diff.toFixed(2),
    currentEarnings: currentEarnings.toFixed(2),
    liabilitiesAndEquity: liabAndEq.toFixed(2),
    sections,
    currentAssets: { total: curAssets.toFixed(2), lines: pickLines('CURRENT_ASSETS') },
    nonCurrentAssets: { total: nonCurAssets.toFixed(2), lines: pickLines('NON_CURRENT_ASSETS') },
    currentLiabilities: { total: curLiab.toFixed(2), lines: pickLines('CURRENT_LIABILITIES') },
    nonCurrentLiabilities: { total: nonCurLiab.toFixed(2), lines: pickLines('NON_CURRENT_LIABILITIES') },
    assets: { total: totalAssets.toFixed(2), current: curAssets.toFixed(2), nonCurrent: nonCurAssets.toFixed(2), lines: allAssetLines.sort((a, b) => String(a.code).localeCompare(String(b.code))) },
    liabilities: { total: totalLiab.toFixed(2), current: curLiab.toFixed(2), nonCurrent: nonCurLiab.toFixed(2), lines: allLiabLines.sort((a, b) => String(a.code).localeCompare(String(b.code))) },
    equity: { total: eqTotal.toFixed(2), totalWithEarnings: totalEquityWithEarnings.toFixed(2), lines: allEqLines.sort((a, b) => String(a.code).localeCompare(String(b.code))) },
  };
}

export function computeDynamicBalanceSheet(
  accounts: any[],
  postedJournals: any[],
  params: { asOf?: string; compareAsOf?: string } & DimensionFilterParams = {},
) {
  const asOf = params.asOf || new Date().toISOString().slice(0, 10);
  const slList = getStatementLines();
  const reclass = getReclassifications();
  const current = computeSingleLocalBalanceSheet(accounts, postedJournals, slList, reclass, { ...params, asOf });

  if (params.compareAsOf) {
    const prev = computeSingleLocalBalanceSheet(accounts, postedJournals, slList, reclass, { ...params, asOf: params.compareAsOf });
    const prevAcc = new Map<string, number>();
    for (const s of prev.sections) for (const a of s.accounts) prevAcc.set(a.accountId, Number(a.amount));
    const prevSec = new Map(prev.sections.map((s: any) => [s.statementLineId || s.sectionCode, Number(s.total)]));
    return {
      ...current,
      sections: current.sections.map((s: any) => ({
        ...s,
        ...calcVar(Number(s.total), prevSec.get(s.statementLineId || s.sectionCode) || 0),
        accounts: s.accounts.map((a: any) => ({
          ...a,
          ...calcVar(Number(a.amount), prevAcc.get(a.accountId) || 0),
        })),
      })),
      comparative: {
        asOf: params.compareAsOf,
        totalAssets: calcVar(Number(current.assets.total), Number(prev.assets.total)),
        currentAssets: calcVar(Number(current.currentAssets.total), Number(prev.currentAssets.total)),
        nonCurrentAssets: calcVar(Number(current.nonCurrentAssets.total), Number(prev.nonCurrentAssets.total)),
        totalLiabilities: calcVar(Number(current.liabilities.total), Number(prev.liabilities.total)),
        currentLiabilities: calcVar(Number(current.currentLiabilities.total), Number(prev.currentLiabilities.total)),
        nonCurrentLiabilities: calcVar(Number(current.nonCurrentLiabilities.total), Number(prev.nonCurrentLiabilities.total)),
        totalEquity: calcVar(Number(current.equity.totalWithEarnings), Number(prev.equity.totalWithEarnings)),
        currentEarnings: calcVar(Number(current.currentEarnings), Number(prev.currentEarnings)),
      },
    };
  }
  return current;
}

// ---------------------------------------------------------------------------
// 7. Dynamic Cash Flow Statement (IAS 7 — Operating / Investing / Financing)
// ---------------------------------------------------------------------------
function computeSingleLocalCashFlow(
  accounts: any[],
  postedJournals: any[],
  reclassifications: any[],
  params: { from: string; to: string } & DimensionFilterParams,
) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const dimMatch = createLineDimMatcher(params);
  const cashIds = new Set<string>();
  const cfCat = new Map<string, string>();

  for (const a of accounts) {
    const eff = resolveLocalEffectiveClassification(a, params.to, reclassifications);
    cfCat.set(a.id, eff.cashFlowCategory);
    if (a.isPosting && eff.cashFlowCategory === 'CASH') cashIds.add(a.id);
  }

  const cashOpen = new Map<string, number>();
  const cashEnd = new Map<string, number>();
  const nonCash = new Map<string, number>();

  const activities: Record<'OPERATING' | 'INVESTING' | 'FINANCING', Map<string, { accountId: string; code: string; nameAr: string; inflow: number; outflow: number; net: number; txCount: number }>> = {
    OPERATING: new Map(),
    INVESTING: new Map(),
    FINANCING: new Map(),
  };

  for (const je of postedJournals) {
    if (je.status !== 'POSTED' || String(je.entryDate) > params.to) continue;
    if (params.ledger && params.ledger !== 'ALL' && je.ledger && je.ledger !== params.ledger) continue;
    const eLines = (je.lines || [])
      .filter((l: any) => dimMatch(l))
      .map((l: any) => ({ ...l, resolvedAcc: byId.get(l.accountId) || byCode.get(l.accountCode) }))
      .filter((l: any) => l.resolvedAcc);

    for (const l of eLines) {
      const aid = l.resolvedAcc.id;
      const dr = Number(l.debitBase || 0);
      const cr = Number(l.creditBase || 0);
      if (cashIds.has(aid)) {
        const delta = dr - cr;
        cashEnd.set(aid, (cashEnd.get(aid) || 0) + delta);
        if (String(je.entryDate) < params.from) {
          cashOpen.set(aid, (cashOpen.get(aid) || 0) + delta);
        }
      }
      if (String(je.entryDate) >= params.from && cfCat.get(aid) === 'NON_CASH') {
        nonCash.set(aid, (nonCash.get(aid) || 0) + Math.abs(dr - cr));
      }
    }

    if (String(je.entryDate) < params.from) continue;

    const cashLines = eLines.filter((l: any) => cashIds.has(l.resolvedAcc.id));
    if (!cashLines.length) continue;
    const otherLines = eLines.filter((l: any) => !cashIds.has(l.resolvedAcc.id));
    const netCashDelta = cashLines.reduce((s: number, l: any) => s + (Number(l.debitBase || 0) - Number(l.creditBase || 0)), 0);
    if (Math.abs(netCashDelta) < 0.005 || !otherLines.length) continue;

    const totalWeight = otherLines.reduce((s: number, l: any) => s + Number(l.debitBase || 0) + Number(l.creditBase || 0), 0);
    if (totalWeight <= 0) continue;

    let allocated = 0;
    otherLines.forEach((ol: any, idx: number) => {
      const isLast = idx === otherLines.length - 1;
      const w = Number(ol.debitBase || 0) + Number(ol.creditBase || 0);
      const share = isLast ? (netCashDelta - allocated) : Math.round((netCashDelta * (w / totalWeight)) * 100) / 100;
      allocated += share;

      const aid = ol.resolvedAcc.id;
      const rawCat = cfCat.get(aid) || 'OPERATING';
      const bucket: 'OPERATING' | 'INVESTING' | 'FINANCING' =
        rawCat === 'INVESTING' ? 'INVESTING' : rawCat === 'FINANCING' ? 'FINANCING' : 'OPERATING';

      const prev = activities[bucket].get(aid) || {
        accountId: aid, code: ol.resolvedAcc.code, nameAr: ol.resolvedAcc.nameAr, inflow: 0, outflow: 0, net: 0, txCount: 0,
      };
      if (share > 0) prev.inflow += share;
      else prev.outflow += Math.abs(share);
      prev.net += share;
      prev.txCount += 1;
      activities[bucket].set(aid, prev);
    });
  }

  const buildSec = (k: 'OPERATING' | 'INVESTING' | 'FINANCING', sectionCode: string, nameAr: string, nameEn: string) => {
    const items = Array.from(activities[k].values())
      .filter((x) => Math.abs(x.net) >= 0.005)
      .sort((a, b) => String(a.code).localeCompare(String(b.code)))
      .map((x) => ({
        accountId: x.accountId,
        code: x.code,
        nameAr: x.nameAr,
        inflow: x.inflow.toFixed(2),
        outflow: x.outflow.toFixed(2),
        amount: x.net.toFixed(2),
        txCount: x.txCount,
      }));
    const total = items.reduce((s, x) => s + Number(x.amount), 0);
    return { sectionCode, nameAr, nameEn, total: total.toFixed(2), accounts: items };
  };

  const operating = buildSec('OPERATING', 'OPERATING_ACTIVITIES', 'التدفقات النقدية من الأنشطة التشغيلية', 'Operating Activities');
  const investing = buildSec('INVESTING', 'INVESTING_ACTIVITIES', 'التدفقات النقدية من الأنشطة الاستثمارية', 'Investing Activities');
  const financing = buildSec('FINANCING', 'FINANCING_ACTIVITIES', 'التدفقات النقدية من الأنشطة التمويلية', 'Financing Activities');

  const openingCash = Array.from(cashOpen.values()).reduce((s, v) => s + v, 0);
  const endingCash = Array.from(cashEnd.values()).reduce((s, v) => s + v, 0);
  const netCashChange = Number(operating.total) + Number(investing.total) + Number(financing.total);
  const reconciliationDiff = endingCash - (openingCash + netCashChange);

  const cashAccounts = Array.from(cashIds)
    .map((cid) => {
      const a = byId.get(cid)!;
      const op = cashOpen.get(cid) || 0;
      const en = cashEnd.get(cid) || 0;
      return {
        accountId: a.id,
        code: a.code,
        nameAr: a.nameAr,
        currencyCode: a.currencyCode || 'SAR',
        openingBalance: op.toFixed(2),
        periodChange: (en - op).toFixed(2),
        endingBalance: en.toFixed(2),
      };
    })
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));

  const nonCashAdjustments = Array.from(nonCash.entries()).map(([aid, amt]) => {
    const a = byId.get(aid);
    return { accountId: aid, code: a?.code || '—', nameAr: a?.nameAr || 'بند غير نقدي', amount: amt.toFixed(2) };
  });

  return {
    from: params.from,
    to: params.to,
    sections: [operating, investing, financing],
    operating,
    investing,
    financing,
    openingCash: openingCash.toFixed(2),
    netCashChange: netCashChange.toFixed(2),
    endingCash: endingCash.toFixed(2),
    reconciliationDiff: reconciliationDiff.toFixed(2),
    reconciled: Math.abs(reconciliationDiff) < 0.05,
    cashAccounts,
    nonCashAdjustments,
  };
}

export function computeDynamicCashFlowStatement(
  accounts: any[],
  postedJournals: any[],
  params: { from?: string; to?: string; compareFrom?: string; compareTo?: string } & DimensionFilterParams = {},
) {
  const from = params.from || `${new Date().getFullYear()}-01-01`;
  const to = params.to || new Date().toISOString().slice(0, 10);
  const reclass = getReclassifications();
  const current = computeSingleLocalCashFlow(accounts, postedJournals, reclass, { ...params, from, to });

  if (params.compareFrom && params.compareTo) {
    const prev = computeSingleLocalCashFlow(accounts, postedJournals, reclass, { ...params, from: params.compareFrom, to: params.compareTo });
    return {
      ...current,
      comparative: {
        from: params.compareFrom,
        to: params.compareTo,
        operating: calcVar(Number(current.operating.total), Number(prev.operating.total)),
        investing: calcVar(Number(current.investing.total), Number(prev.investing.total)),
        financing: calcVar(Number(current.financing.total), Number(prev.financing.total)),
        netCashChange: calcVar(Number(current.netCashChange), Number(prev.netCashChange)),
        endingCash: calcVar(Number(current.endingCash), Number(prev.endingCash)),
      },
    };
  }
  return current;
}

// ---------------------------------------------------------------------------
// 8. Dynamic Statement of Changes in Equity
// ---------------------------------------------------------------------------
function computeSingleLocalEquityChanges(
  accounts: any[],
  postedJournals: any[],
  reclassifications: any[],
  params: { from: string; to: string } & DimensionFilterParams,
) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const dimMatch = createLineDimMatcher(params);
  const equityAccounts = accounts.filter(
    (a) => a.isPosting && resolveLocalEffectiveClassification(a, params.to, reclassifications).statementSection === 'EQUITY',
  );
  const eqIds = new Set(equityAccounts.map((a) => a.id));

  const cols = new Map<string, { accountId: string; code: string; nameAr: string; equitySection: string; opening: number; additions: number; reductions: number; closingTransfers: number }>();
  for (const ea of equityAccounts) {
    cols.set(ea.id, {
      accountId: ea.id, code: ea.code, nameAr: ea.nameAr, equitySection: inferLocalEquitySection(ea),
      opening: 0, additions: 0, reductions: 0, closingTransfers: 0,
    });
  }

  let openingUnclosed = 0;
  let periodNetProfit = 0;
  let closingPnlTransfer = 0;
  const movements: any[] = [];

  for (const je of postedJournals) {
    if (je.status !== 'POSTED' || String(je.entryDate) > params.to) continue;
    if (params.ledger && params.ledger !== 'ALL' && je.ledger && je.ledger !== params.ledger) continue;
    for (const l of (je.lines || [])) {
      if (!dimMatch(l)) continue;
      const acc = byId.get(l.accountId) || byCode.get(l.accountCode);
      if (!acc || !acc.isPosting) continue;
      const eff = resolveLocalEffectiveClassification(acc, params.to, reclassifications);
      const netCr = Number(l.creditBase || 0) - Number(l.debitBase || 0);

      if (eqIds.has(acc.id)) {
        const col = cols.get(acc.id)!;
        if (String(je.entryDate) < params.from) {
          col.opening += netCr;
        } else {
          if (je.journalType === 'CLOSING') col.closingTransfers += netCr;
          else if (netCr >= 0) col.additions += netCr;
          else col.reductions += netCr;
          movements.push({
            entryId: je.id,
            entryNo: je.entryNo,
            entryDate: je.entryDate,
            journalType: je.journalType,
            accountId: acc.id,
            code: acc.code,
            nameAr: acc.nameAr,
            description: l.description || je.description || 'حركة حقوق ملكية',
            amount: netCr.toFixed(2),
          });
        }
      } else if (IS_SECTIONS.has(eff.statementSection)) {
        if (String(je.entryDate) < params.from) openingUnclosed += netCr;
        else if (je.journalType === 'CLOSING') closingPnlTransfer += netCr;
        else periodNetProfit += netCr;
      }
    }
  }

  const components = Array.from(cols.values()).map((c) => ({
    accountId: c.accountId,
    code: c.code,
    nameAr: c.nameAr,
    equitySection: c.equitySection,
    opening: c.opening.toFixed(2),
    additions: c.additions.toFixed(2),
    reductions: c.reductions.toFixed(2),
    closingTransfers: c.closingTransfers.toFixed(2),
    ending: (c.opening + c.additions + c.reductions + c.closingTransfers).toFixed(2),
  }));

  const endingUnclosed = openingUnclosed + periodNetProfit + closingPnlTransfer;
  const totalOpening = components.reduce((s, c) => s + Number(c.opening), openingUnclosed);
  const totalAdditions = components.reduce((s, c) => s + Number(c.additions), 0);
  const totalReductions = components.reduce((s, c) => s + Number(c.reductions), 0);
  const totalClosingNet = components.reduce((s, c) => s + Number(c.closingTransfers), closingPnlTransfer);
  const totalEnding = totalOpening + periodNetProfit + totalAdditions + totalReductions + totalClosingNet;

  return {
    from: params.from,
    to: params.to,
    components,
    unclosedEarnings: {
      opening: openingUnclosed.toFixed(2),
      periodNetProfit: periodNetProfit.toFixed(2),
      closingTransfers: closingPnlTransfer.toFixed(2),
      ending: endingUnclosed.toFixed(2),
    },
    summary: {
      openingEquity: totalOpening.toFixed(2),
      netProfit: periodNetProfit.toFixed(2),
      capitalAdditions: totalAdditions.toFixed(2),
      distributionsAndReductions: totalReductions.toFixed(2),
      closingAdjustments: totalClosingNet.toFixed(2),
      endingEquity: totalEnding.toFixed(2),
    },
    movements,
  };
}

export function computeDynamicEquityChangesStatement(
  accounts: any[],
  postedJournals: any[],
  params: { from?: string; to?: string; compareFrom?: string; compareTo?: string } & DimensionFilterParams = {},
) {
  const from = params.from || `${new Date().getFullYear()}-01-01`;
  const to = params.to || new Date().toISOString().slice(0, 10);
  const reclass = getReclassifications();
  const current = computeSingleLocalEquityChanges(accounts, postedJournals, reclass, { ...params, from, to });

  if (params.compareFrom && params.compareTo) {
    const prev = computeSingleLocalEquityChanges(accounts, postedJournals, reclass, { ...params, from: params.compareFrom, to: params.compareTo });
    return {
      ...current,
      comparative: {
        from: params.compareFrom,
        to: params.compareTo,
        openingEquity: calcVar(Number(current.summary.openingEquity), Number(prev.summary.openingEquity)),
        netProfit: calcVar(Number(current.summary.netProfit), Number(prev.summary.netProfit)),
        endingEquity: calcVar(Number(current.summary.endingEquity), Number(prev.summary.endingEquity)),
      },
    };
  }
  return current;
}
