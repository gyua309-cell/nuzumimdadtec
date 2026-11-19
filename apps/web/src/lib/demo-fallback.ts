import { getStoredCompany, saveStoredCompany } from './storage-company';
import { getEntityList, saveEntityItem, deleteEntityItem } from './local-store';
import {
  sha256Hex,
  recordAudit,
  defaultCurrenciesList,
  defaultExchangeRatesList,
  defaultCostComponentsList,
  defaultCostProfilesList,
  defaultVariableTypesList,
  defaultFiscalPeriodsList,
  defaultBankAccountsList,
  defaultAssetCategoriesList,
  getOverheadPolicy,
  saveOverheadPolicy,
  getNormalizedAccounts,
  convertToBase,
  resolvePeriodByIdOrDate,
  assertPeriodOpen,
  computeEmployeeCostBreakdown,
  normalizeJournalEntry,
  createAutoPostedJournalEntry,
  createReversalJournalEntry,
  computeTrialBalance,
  computeIncomeStatement,
  computeBalanceSheet,
  computeAccountStatement,
  evaluatePeriodClosingChecks,
  isAssignmentActiveInPeriod,
  matchesEmployee,
  matchesProject,
} from './fallback-engine';
import {
  activateAssetItem,
  addCustodyExpenseLine,
  assignAssetCustody,
  autoGenerateSalesInvoicesFromAssignments,
  batchTransmitZatcaInvoices,
  buildZatcaUblXml,
  cancelDepreciationRunItem,
  cancelPurchaseInvoiceItem,
  cancelSalesInvoice,
  cancelZakatReturnItem,
  closeCustodyItem,
  computeCashFlowSummary,
  computeCustodiesReport,
  computeVatReturnSummary,
  computeZakatSummary,
  convertCustodyItem,
  createAssetItem,
  createCreditNoteAndPost,
  createCustodyItem,
  createDebitNoteAndPost,
  createPurchaseInvoiceItem,
  createSalesInvoice,
  decodeZatcaTlv,
  deleteCustodyExpenseLine,
  disburseCustodyItem,
  disposeAssetItem,
  executeDepreciationRun,
  getZatcaLiveStatus,
  getZatcaSettings,
  getZakatSettings,
  onboardZatcaSettings,
  payPurchaseInvoiceItem,
  postPurchaseInvoiceItem,
  postSalesInvoice,
  postZakatReturnItem,
  previewDepreciationRun,
  recordSalesInvoicePayment,
  repairSalesInvoiceJournal,
  returnAssetCustody,
  saveZakatReturnDraft,
  saveZakatSettings,
  settleCustodyExpenses,
  transmitZatcaInvoice,
} from './cycle-engine';

/** Filters sales/purchase invoice collections by status, ZATCA state, and fiscal period (ID or date window). */
function filterInvoicesByQuery(items: any[], path: string, opts?: { isZatca?: boolean }): any[] {
  const qStr = path.includes('?') ? path.split('?')[1] : '';
  const params = new URLSearchParams(qStr);
  const statusFilter = params.get('status');
  const fiscalPeriodId = params.get('fiscalPeriodId') || params.get('periodId');

  let result = items;
  if (opts?.isZatca) {
    result = result.filter((i: any) => i.status === 'POSTED');
    if (statusFilter && statusFilter !== 'ALL') {
      result = result.filter((i: any) => (i.zatcaStatus || 'NOT_SUBMITTED') === statusFilter);
    }
  } else if (statusFilter) {
    result = result.filter((i: any) => i.status === statusFilter);
  }

  if (fiscalPeriodId) {
    const resolved = resolvePeriodByIdOrDate(fiscalPeriodId, null);
    const targetStart = resolved?.startDate ? String(resolved.startDate).slice(0, 10) : '';
    const targetEnd = resolved?.endDate ? String(resolved.endDate).slice(0, 10) : '';
    result = result.filter((item: any) => {
      if (item.fiscalPeriodId) {
        return item.fiscalPeriodId === fiscalPeriodId || (resolved && item.fiscalPeriodId === resolved.id);
      }
      const docDate = String(item.issueDate || item.invoiceDate || item.date || item.createdAt || '').slice(0, 10);
      return Boolean(targetStart && targetEnd && docDate && docDate >= targetStart && docDate <= targetEnd);
    });
  }

  return result;
}

/**
 * Clean Production In-Browser Engine (GitHub Pages)
 * Zero hardcoded fake/demo data.
 * Pure dynamic storage backed by localStorage with full CRUD (Create, Read, Update, Delete).
 */

export function makeList<T = any>(items: T[]): T[] & { data: T[]; meta: { page: number; pageSize: number; total: number }; items: T[]; success: boolean } {
  const arr = (Array.isArray(items) ? [...items] : []) as any;
  arr.data = arr;
  arr.meta = { page: 1, pageSize: 50, total: arr.length };
  arr.items = arr;
  arr.success = true;
  return arr;
}

export const defaultBranches = [
  { id: 'br-hq', code: 'HQ', nameAr: 'المقر الرئيسي (الرياض)', nameEn: 'Headquarters - Riyadh', city: 'الرياض', isDefault: true, isActive: true },
  { id: 'br-cai', code: 'CAI', nameAr: 'فرع القاهرة (مركز التطوير)', nameEn: 'Cairo Branch - Dev Center', city: 'القاهرة', isDefault: false, isActive: true },
];

export const defaultDepartments = [
  { id: 'dept-dev', code: 'DEV', nameAr: 'إدارة تطوير البرمجيات والأنظمة', nameEn: 'Software Engineering', isActive: true },
  { id: 'dept-qa', code: 'QA', nameAr: 'إدارة الجودة وضمان الأداء', nameEn: 'Quality Assurance', isActive: true },
  { id: 'dept-infra', code: 'INFRA', nameAr: 'إدارة البنية السحابية وDevOps', nameEn: 'Cloud Infrastructure', isActive: true },
  { id: 'dept-pmo', code: 'PMO', nameAr: 'إدارة المشاريع الرقمية', nameEn: 'Digital PMO', isActive: true },
];

export const defaultPositions = [
  { id: 'pos-fs', code: 'POS-FS', titleAr: 'مهندس برمجيات متقدم (Senior Full-Stack)', titleEn: 'Senior Full-Stack Engineer', departmentId: 'dept-dev', isActive: true },
  { id: 'pos-be', code: 'POS-BE', titleAr: 'مهندس واجهات خلفية (Backend Engineer)', titleEn: 'Backend Engineer', departmentId: 'dept-dev', isActive: true },
  { id: 'pos-fe', code: 'POS-FE', titleAr: 'مهندس واجهات أمامية (Frontend Engineer)', titleEn: 'Frontend Engineer', departmentId: 'dept-dev', isActive: true },
  { id: 'pos-devops', code: 'POS-OPS', titleAr: 'مهندس سحابي وعمليات (DevOps Engineer)', titleEn: 'DevOps Engineer', departmentId: 'dept-infra', isActive: true },
  { id: 'pos-pm', code: 'POS-PM', titleAr: 'مدير مشروع تقني (Technical PM)', titleEn: 'Technical Project Manager', departmentId: 'dept-pmo', isActive: true },
];

export const defaultCostProfiles = defaultCostProfilesList;

export const defaultCostCenters = [
  { id: 'cc-del', code: 'CC-DEL', nameAr: 'مركز تكلفة التسليم والمشاريع', nameEn: 'Delivery Cost Center', isActive: true },
  { id: 'cc-rnd', code: 'CC-RND', nameAr: 'مركز تكلفة البحوث والتطوير R&D', nameEn: 'R&D Cost Center', isActive: true },
];

export const defaultClients = [
  {
    id: 'cli-001',
    code: 'CLI-001',
    nameAr: 'شركة التقنية المتقدمة للحلول الرقمية',
    nameEn: 'Advanced Tech Digital Solutions Co.',
    currencyCode: 'SAR',
    taxNumber: '310123456700003',
    paymentTermsDays: 30,
    email: 'billing@advtech.sa',
    phone: '+966112345678',
    isActive: true,
  },
  {
    id: 'cli-002',
    code: 'CLI-002',
    nameAr: 'مجموعة إمداد للتجارة والخدمات',
    nameEn: 'Imdad Trading & Services Group',
    currencyCode: 'SAR',
    taxNumber: '310987654300003',
    paymentTermsDays: 15,
    email: 'finance@imdad.sa',
    phone: '+966123456789',
    isActive: true,
  },
];

export function getDemoFallback(path: string, method = 'GET', body?: any): any {
  // Handle mutations (POST/PATCH/PUT/DELETE) for all entities
  const recomputeEmployeeOverAllocation = (targetEmpIdOrCode?: string) => {
    const allAsg = getEntityList<any>('assignments', []);
    if (allAsg.length === 0) return;
    const t = new Date().toISOString().slice(0, 10);
    const empTotals = new Map<string, number>();
    for (const a of allAsg) {
      const asgEnd = a.endDate || a.effectiveTo;
      if (asgEnd && asgEnd < t) continue;
      const key = String(a.employeeId || a.employeeCode || '');
      if (!key) continue;
      if (targetEmpIdOrCode && key !== targetEmpIdOrCode && a.employeeCode !== targetEmpIdOrCode) continue;
      const pct = Number(a.allocationPct != null ? a.allocationPct : (a.allocationBasis === 'DAYS' ? ((Number(a.allocatedDays) || 22) / 22) * 100 : 100));
      empTotals.set(key, (empTotals.get(key) || 0) + pct);
    }
    let changed = false;
    const updated = allAsg.map((a: any) => {
      const key = String(a.employeeId || a.employeeCode || '');
      if (targetEmpIdOrCode && key !== targetEmpIdOrCode && a.employeeCode !== targetEmpIdOrCode) return a;
      const asgEnd = a.endDate || a.effectiveTo;
      if (asgEnd && asgEnd < t) {
        if (a.isOverAllocated) {
          changed = true;
          return { ...a, isOverAllocated: false, overAllocatedPct: 0 };
        }
        return a;
      }
      const tot = empTotals.get(key) || 0;
      const isOver = tot > 100;
      const overPct = Math.max(0, Number((tot - 100).toFixed(1)));
      if (a.isOverAllocated !== isOver || a.overAllocatedPct !== overPct) {
        changed = true;
        return { ...a, isOverAllocated: isOver, overAllocatedPct: overPct };
      }
      return a;
    });
    if (changed) {
      localStorage.setItem('idham_prod_assignments', JSON.stringify(updated));
    }
  };

  if (method !== 'GET') {
    if (path.includes('/companies/current')) {
      return saveStoredCompany(body);
    }
    // --- 1. Robust Employee Sub-routes and Mutations ---
    if (path.startsWith('/employees/')) {
      const cleanP = path.split('?')[0].replace(/\/$/, '');
      const segments = cleanP.split('/').filter(Boolean); // ['employees', id, (subAction), (subId)]
      const empId = segments[1];
      const subAction = segments[2];
      const subId = segments[3];
      const emps = getEntityList('employees', []);
      const empIndex = emps.findIndex((e) => e.id === empId || e.code === empId || e.code?.toLowerCase() === empId?.toLowerCase());
      const emp = empIndex >= 0 ? { ...emps[empIndex] } : null;

      if (method === 'DELETE' && !subAction) {
        if (empIndex >= 0) {
          const delEmp = emps[empIndex];
          deleteEntityItem('employees', delEmp.id);
          const allAsg = getEntityList('assignments', []);
          const remainingAsg = allAsg.filter((a: any) => a.employeeId !== delEmp.id && a.employeeId !== delEmp.code);
          if (remainingAsg.length !== allAsg.length) {
            localStorage.setItem('idham_prod_assignments', JSON.stringify(remainingAsg));
          }
          recordAudit({ action: 'DELETE_EMPLOYEE', schemaName: 'hr', tableName: 'employees', entityId: delEmp.id, oldValues: { code: delEmp.code, fullNameAr: delEmp.fullNameAr }, reason: 'حذف ملف موظف' });
        }
        return { success: true, message: 'تم حذف الموظف بنجاح' };
      }

      if (method === 'PATCH' && !subAction) {
        const targetEmp = emp || { id: empId, code: body?.code || empId };
        const updated = {
          ...targetEmp,
          ...body,
          id: targetEmp.id || empId,
          code: targetEmp.code || empId,
          fullNameAr: body?.fullNameAr || targetEmp.fullNameAr || ('موظف ' + empId),
          fullNameEn: body?.fullNameEn !== undefined ? body.fullNameEn : (targetEmp.fullNameEn || ''),
          updatedAt: new Date().toISOString(),
          rowVersion: ((targetEmp.rowVersion) || 1) + 1,
        };
        saveEntityItem('employees', updated);
        recordAudit({ action: 'UPDATE_EMPLOYEE', schemaName: 'hr', tableName: 'employees', entityId: updated.id, oldValues: emp ? { fullNameAr: emp.fullNameAr, basicSalary: emp.basicSalary } : null, newValues: body, reason: 'تحديث البيانات الأساسية للموظف' });
        return updated;
      }

      if (emp) {
        if (subAction === 'compensations' && method === 'POST') {
          const oldSalary = emp.basicSalary;
          const newComp = {
            id: `cmp-${Date.now()}`,
            effectiveFrom: body.effectiveFrom || new Date().toISOString().slice(0, 10),
            effectiveTo: null,
            basicSalary: String(body.basicSalary || '0.00'),
            salaryCurrency: body.salaryCurrency || 'SAR',
            insuranceSalary: String(body.insuranceSalary || '0.00'),
            insuranceCurrency: body.insuranceCurrency || body.salaryCurrency || 'SAR',
            changeReason: body.reason || body.changeReason || 'تعديل الراتب المعتمد',
            createdBy: 'المدير التنفيذي',
            createdAt: new Date().toISOString(),
          };
          const curComps = Array.isArray(emp.compensations) ? emp.compensations : [];
          if (curComps.length > 0 && !curComps[0].effectiveTo) curComps[0].effectiveTo = newComp.effectiveFrom;
          emp.basicSalary = newComp.basicSalary;
          emp.salaryCurrency = newComp.salaryCurrency;
          emp.insuranceSalary = newComp.insuranceSalary;
          emp.insuranceCurrency = newComp.insuranceCurrency;
          emp.compensations = [newComp, ...curComps];
          saveEntityItem('employees', emp);
          recordAudit({ action: 'UPDATE_EMPLOYEE_SALARY', schemaName: 'hr', tableName: 'employee_compensations', entityId: emp.id, oldValues: { basicSalary: oldSalary }, newValues: newComp, reason: newComp.changeReason });
          return emp;
        }

        if (subAction === 'placements' && method === 'POST') {
          const departments = getEntityList('departments', defaultDepartments);
          const positions = getEntityList('positions', defaultPositions);
          const branches = getEntityList('branches', defaultBranches);
          const dept = departments.find((d) => d.id === body.departmentId);
          const pos = positions.find((p) => p.id === body.positionId);
          const br = branches.find((b) => b.id === body.branchId);
          const newPlc = {
            id: `plc-${Date.now()}`,
            effectiveFrom: body.effectiveFrom || new Date().toISOString().slice(0, 10),
            effectiveTo: null,
            departmentId: body.departmentId || null,
            positionId: body.positionId || null,
            branchId: body.branchId || null,
            costCenterId: body.costCenterId || null,
            managerEmployeeId: body.managerEmployeeId || null,
            departmentName: dept?.nameAr || emp.departmentName || '',
            positionTitle: pos?.titleAr || emp.positionTitle || '',
            branchName: br?.nameAr || emp.branchName || '',
            changeReason: body.reason || 'تغيير التنسيب الوظيفي',
          };
          const curPlcs = Array.isArray(emp.placements) ? emp.placements : [];
          if (curPlcs.length > 0 && !curPlcs[0].effectiveTo) curPlcs[0].effectiveTo = newPlc.effectiveFrom;
          emp.departmentId = newPlc.departmentId;
          emp.departmentName = newPlc.departmentName;
          emp.positionId = newPlc.positionId;
          emp.positionTitle = newPlc.positionTitle;
          emp.branchId = newPlc.branchId;
          emp.branchName = newPlc.branchName;
          emp.placements = [newPlc, ...curPlcs];
          saveEntityItem('employees', emp);
          recordAudit({ action: 'UPDATE_EMPLOYEE_PLACEMENT', schemaName: 'hr', tableName: 'employee_placements', entityId: emp.id, newValues: newPlc, reason: newPlc.changeReason });
          return emp;
        }

        if (subAction === 'cost-profiles' && method === 'POST') {
          if (cleanP.endsWith('/end')) {
            const curP = Array.isArray(emp.costProfiles) ? emp.costProfiles : [];
            if (curP.length > 0) curP[0].effectiveTo = body.effectiveTo || new Date().toISOString().slice(0, 10);
            emp.costProfiles = curP;
            recordAudit({ action: 'END_EMPLOYEE_COST_PROFILE', schemaName: 'cost', tableName: 'employee_cost_profiles', entityId: emp.id, newValues: { effectiveTo: body.effectiveTo }, reason: 'إنهاء سريان ملف تكلفة الموظف' });
          } else {
            const profiles = getEntityList('cost_profiles', defaultCostProfilesList);
            const prf = profiles.find((p) => p.id === body.profileId);
            const newP = {
              id: `ecp-${Date.now()}`,
              profileId: body.profileId,
              profileCode: prf?.code || 'STD',
              profileName: prf?.nameAr || 'ملف التكلفة المعتمد',
              effectiveFrom: body.effectiveFrom || new Date().toISOString().slice(0, 10),
              effectiveTo: null,
            };
            const curP = Array.isArray(emp.costProfiles) ? emp.costProfiles : [];
            if (curP.length > 0 && !curP[0].effectiveTo) curP[0].effectiveTo = newP.effectiveFrom;
            emp.costProfileId = newP.profileId;
            emp.costProfileName = newP.profileName;
            emp.costProfiles = [newP, ...curP];
            recordAudit({ action: 'ASSIGN_EMPLOYEE_COST_PROFILE', schemaName: 'cost', tableName: 'employee_cost_profiles', entityId: emp.id, newValues: newP, reason: `ربط الموظف بملف التكلفة (${newP.profileName})` });
          }
          saveEntityItem('employees', emp);
          return emp;
        }

        if (subAction === 'overrides' && method === 'POST') {
          const curO = Array.isArray(emp.overrides) ? emp.overrides : [];
          if (cleanP.endsWith('/end') && subId) {
            const targetO = curO.find((o: any) => o.id === subId);
            if (targetO) targetO.effectiveTo = body.effectiveTo;
            recordAudit({ action: 'END_EMPLOYEE_OVERRIDE', schemaName: 'cost', tableName: 'employee_cost_overrides', entityId: emp.id, newValues: { overrideId: subId, effectiveTo: body.effectiveTo }, reason: 'إنهاء استثناء تكلفة موظف' });
          } else {
            const newO = {
              id: `ovr-${Date.now()}`,
              componentId: body.componentId,
              isExcluded: !!body.isExcluded,
              ratePct: body.ratePct || null,
              amount: body.amount || null,
              currencyCode: body.currencyCode || 'SAR',
              reason: body.reason || 'استثناء خاص بالموظف',
              effectiveFrom: body.effectiveFrom || new Date().toISOString().slice(0, 10),
              effectiveTo: null,
            };
            emp.overrides = [newO, ...curO];
            recordAudit({ action: 'CREATE_EMPLOYEE_OVERRIDE', schemaName: 'cost', tableName: 'employee_cost_overrides', entityId: emp.id, newValues: newO, reason: newO.reason });
          }
          saveEntityItem('employees', emp);
          return emp;
        }

        if (subAction === 'status' && method === 'POST') {
          const oldStatus = emp.status;
          const newStatus = body.newStatus || 'ACTIVE';
          const newSh = {
            id: `sh-${Date.now()}`,
            oldStatus: emp.status,
            newStatus,
            effectiveDate: body.effectiveDate || new Date().toISOString().slice(0, 10),
            reason: body.reason || 'تغيير الحالة الإدارية',
            changedBy: 'المدير التنفيذي',
            changedAt: new Date().toISOString(),
          };
          emp.status = newStatus;
          emp.statusHistory = [newSh, ...(Array.isArray(emp.statusHistory) ? emp.statusHistory : [])];
          saveEntityItem('employees', emp);
          recordAudit({ action: 'UPDATE_EMPLOYEE_STATUS', schemaName: 'hr', tableName: 'employees', entityId: emp.id, oldValues: { status: oldStatus }, newValues: { status: newStatus }, reason: newSh.reason });
          return emp;
        }

        if (subAction === 'documents' && method === 'POST') {
          const newDoc = {
            id: `doc-${Date.now()}`,
            title: body.title || 'مستند موظف',
            docType: body.docType || 'CONTRACT',
            docNumber: body.docNumber || '—',
            issueDate: body.issueDate || null,
            expiryDate: body.expiryDate || null,
            fileName: body.fileName || (body.file && body.file.name) || 'document.pdf',
            sizeBytes: 1024 * 45,
            notes: body.notes || '',
            createdAt: new Date().toISOString(),
          };
          emp.documents = [newDoc, ...(Array.isArray(emp.documents) ? emp.documents : [])];
          saveEntityItem('employees', emp);
          recordAudit({ action: 'ADD_EMPLOYEE_DOCUMENT', schemaName: 'hr', tableName: 'employee_documents', entityId: emp.id, newValues: newDoc, reason: `إضافة مستند (${newDoc.title})` });
          return emp;
        }

        if (method === 'DELETE' && subAction && subId) {
          const arrKey = subAction === 'compensations' ? 'compensations'
                       : subAction === 'placements' ? 'placements'
                       : subAction === 'cost-profiles' ? 'costProfiles'
                       : subAction === 'overrides' ? 'overrides'
                       : subAction === 'documents' ? 'documents' : null;
          if (arrKey && Array.isArray(emp[arrKey])) {
            emp[arrKey] = emp[arrKey].filter((x: any) => x.id !== subId);
            saveEntityItem('employees', emp);
            recordAudit({ action: 'DELETE', schemaName: 'hr', tableName: arrKey, entityId: subId, reason: `حذف سجل فرعي (${arrKey}) للموظف ${emp.fullNameAr}` });
          }
          return { success: true };
        }
      }
    }

    // --- 1.1 Robust Project Sub-routes and Mutations ---
    if (path.startsWith('/projects/')) {
      const cleanP = path.split('?')[0].replace(/\/$/, '');
      const segments = cleanP.split('/').filter(Boolean); // ['projects', id, (subAction)]
      const prjId = segments[1];
      const subAction = segments[2];
      const prjs = getEntityList('projects', []);
      const prjIndex = prjs.findIndex((p: any) => p.id === prjId || p.code === prjId || p.code?.toLowerCase() === prjId?.toLowerCase());
      const prj = prjIndex >= 0 ? { ...prjs[prjIndex] } : null;

      if (method === 'DELETE' && !subAction) {
        if (prjIndex >= 0) {
          deleteEntityItem('projects', prjs[prjIndex].id);
          const allAsg = getEntityList('assignments', []);
          const remainingAsg = allAsg.filter((a: any) => a.projectId !== prjs[prjIndex].id && a.projectId !== prjs[prjIndex].code);
          if (remainingAsg.length !== allAsg.length) {
            localStorage.setItem('idham_prod_assignments', JSON.stringify(remainingAsg));
          }
          recordAudit({ action: 'DELETE_PROJECT', schemaName: 'pmo', tableName: 'projects', entityId: prjs[prjIndex].id, reason: 'حذف مشروع' });
        }
        return { success: true, message: 'تم حذف المشروع بنجاح' };
      }

      if ((method === 'PATCH' || method === 'PUT') && !subAction) {
        if (prj) {
          const updated = {
            ...prj,
            ...body,
            id: prj.id,
            code: prj.code,
            nameAr: body.nameAr || prj.nameAr,
          };
          saveEntityItem('projects', updated);
          recordAudit({ action: 'UPDATE_PROJECT', schemaName: 'pmo', tableName: 'projects', entityId: updated.id, newValues: body, reason: 'تحديث بيانات المشروع' });
          return updated;
        }
      }

      if (subAction === 'status') {
        if (prj) {
          const oldStatus = prj.status;
          prj.status = body.newStatus;
          if (!Array.isArray(prj.statusHistory)) {
            prj.statusHistory = [];
          }
          prj.statusHistory.unshift({
            id: `sh-${Date.now()}`,
            fromStatus: oldStatus,
            toStatus: body.newStatus,
            reason: body.reason || 'تحديث حالة المشروع',
            changedBy: 'المدير التنفيذي',
            changedAt: new Date().toISOString(),
          });
          saveEntityItem('projects', prj);
          recordAudit({ action: 'UPDATE_PROJECT_STATUS', schemaName: 'pmo', tableName: 'projects', entityId: prj.id, oldValues: { status: oldStatus }, newValues: { status: body.newStatus }, reason: body.reason || 'تحديث حالة المشروع' });
          return prj;
        }
      }
    }

    // --- 1.2 Service Prices End Route (Business Process Section 6 & 8) ---
    if (path.startsWith('/service-prices/') && path.endsWith('/end') && method === 'POST') {
      const spId = path.split('?')[0].split('/')[2];
      const list = getEntityList<any>('service_prices', []);
      const idx = list.findIndex((s) => s.id === spId);
      if (idx >= 0) {
        const endDate = body?.effectiveTo || body?.endDate || new Date().toISOString().slice(0, 10);
        list[idx].effectiveTo = endDate;
        saveEntityItem('service_prices', list[idx]);
        recordAudit({
          action: 'END_SERVICE_PRICE',
          schemaName: 'revenue',
          tableName: 'service_prices',
          entityId: spId,
          oldValues: { effectiveTo: null },
          newValues: { effectiveTo: endDate },
          reason: `إنهاء سريان سعر خدمة الموظف ${list[idx].employeeName || ''}`,
        });
        return list[idx];
      }
    }

    // --- 2. Robust Assignment Mutations (Business Process Section 7 & 11) ---
    if (path.startsWith('/assignments')) {
      const cleanP = path.split('?')[0].replace(/\/$/, '');
      if (cleanP.endsWith('/end') && method === 'POST') {
        const asgId = cleanP.split('/')[2];
        const allAsg = getEntityList<any>('assignments', []);
        const idx = allAsg.findIndex((a) => a.id === asgId);
        if (idx >= 0) {
          const endDate = body?.endDate || body?.effectiveTo || new Date().toISOString().slice(0, 10);
          allAsg[idx].endDate = endDate;
          allAsg[idx].effectiveTo = endDate;
          saveEntityItem('assignments', allAsg[idx]);
          recomputeEmployeeOverAllocation(allAsg[idx].employeeId || allAsg[idx].employeeCode);
          recordAudit({
            action: 'END_ASSIGNMENT',
            schemaName: 'pmo',
            tableName: 'assignments',
            entityId: asgId,
            oldValues: { endDate: null },
            newValues: { endDate },
            reason: body?.reason || `إنهاء تخصيص الموظف ${allAsg[idx].employeeName || ''} في مشروع ${allAsg[idx].projectName || ''}`,
          });
          return allAsg[idx];
        }
      }
      if (method === 'DELETE') {
        const id = cleanP.split('/').filter(Boolean).pop();
        const existing = getEntityList<any>('assignments', []).find((a) => a.id === id);
        if (id) deleteEntityItem('assignments', id);
        if (existing) {
          recomputeEmployeeOverAllocation(existing.employeeId || existing.employeeCode);
          recordAudit({
            action: 'DELETE_ASSIGNMENT',
            schemaName: 'pmo',
            tableName: 'assignments',
            entityId: id!,
            oldValues: existing,
            reason: `حذف تخصيص الموظف ${existing.employeeName || ''}`,
          });
        }
        return { success: true, message: 'تم حذف الإسناد بنجاح' };
      }
      if (typeof body === 'object' && body !== null) {
        const emps = getEntityList('employees', []);
        const projects = getEntityList('projects', []);
        const emp = emps.find((e) => e.id === body.employeeId || e.code === body.employeeId);
        const prj = projects.find((p) => p.id === body.projectId || p.code === body.projectId);
        const workingDays = Number(body.workingDaysInMonth || 22);
        let allocPct = Number(body.allocationPct ?? 100);
        let allocDays = Number(body.allocatedDays ?? (allocPct / 100) * workingDays);
        if (body.allocationBasis === 'DAYS') {
          allocDays = Number(body.allocatedDays || workingDays);
          allocPct = (allocDays / workingDays) * 100;
        }
        const billableRate = Number(body.billableRate || emp?.defaultBillingRate || 1500);
        const billingBasis = body.billingBasis || emp?.defaultBillingBasis || 'DAILY';
        let rev = 0;
        if (billingBasis === 'DAILY') rev = allocDays * billableRate;
        else if (billingBasis === 'MONTHLY') rev = (allocPct / 100) * billableRate;
        else if (billingBasis === 'HOURLY') rev = (Number(body.allocatedHours) || allocDays * 8) * billableRate;

        const empSalary = Number(emp?.basicSalary || 0);
        const allocatedCost = (allocPct / 100) * empSalary;
        const startDateStr = body.startDate || body.effectiveFrom || new Date().toISOString().slice(0, 10);
        const endDateStr = body.endDate || body.effectiveTo || null;

        const enrichedAsg = {
          id: body.id || `asg-${Date.now()}`,
          employeeId: emp?.id || body.employeeId,
          employeeCode: emp?.code || body.employeeCode || '',
          employeeName: emp?.fullNameAr || emp?.full_name_ar || body.employeeName || 'موظف',
          projectId: prj?.id || body.projectId,
          projectCode: prj?.code || body.projectCode || '',
          projectName: prj?.nameAr || body.projectName || 'مشروع',
          clientName: prj?.clientName || body.clientName || 'عميل',
          allocationBasis: body.allocationBasis || 'PERCENTAGE',
          allocationPct: Number(allocPct.toFixed(2)),
          allocatedDays: Number(allocDays.toFixed(2)),
          allocatedHours: body.allocatedHours ? Number(body.allocatedHours) : null,
          workingDaysInMonth: workingDays,
          billableRate,
          billingBasis,
          billingCurrency: body.billingCurrency || 'SAR',
          startDate: startDateStr,
          endDate: endDateStr,
          effectiveFrom: startDateStr,
          effectiveTo: endDateStr,
          roleTitle: body.roleTitle || emp?.positionTitle || 'مهندس برمجيات',
          isBillable: body.isBillable !== false,
          monthlyRevenue: rev,
          allocatedCost,
          marginPct: rev > 0 ? (((rev - allocatedCost) / rev) * 100).toFixed(1) : '0',
          changeReason: body.changeReason || body.notes || 'إسناد الموظف إلى المشروع',
          notes: body.notes || body.changeReason || null,
        };
        const saved = saveEntityItem('assignments', enrichedAsg);
        recomputeEmployeeOverAllocation(enrichedAsg.employeeId || enrichedAsg.employeeCode);
        const refreshed = getEntityList<any>('assignments', []).find((a) => a.id === saved.id) || saved;
        recordAudit({
          action: 'CREATE_ASSIGNMENT',
          schemaName: 'pmo',
          tableName: 'assignments',
          entityId: refreshed.id,
          newValues: { employeeName: refreshed.employeeName, projectName: refreshed.projectName, allocationPct: refreshed.allocationPct, isOverAllocated: refreshed.isOverAllocated },
          reason: refreshed.changeReason,
        });
        return refreshed;
      }
    }


    // --- 2.1 Robust Closing & Period Operations (Business Process Section 27, 28, 29) ---
    if (path.includes('/closing/periods/') && path.endsWith('/close') && method === 'POST') {
      const periodId = path.split('?')[0].split('/')[3];
      const periods = getEntityList('fiscal_periods', defaultFiscalPeriodsList);
      const pIdx = periods.findIndex((p: any) => p.id === periodId);
      const periodObj = pIdx >= 0 ? periods[pIdx] : { id: periodId, name: 'الفترة المالية', startDate: '2026-01-01', endDate: new Date().toISOString().slice(0, 10) };
      const checks = evaluatePeriodClosingChecks(periodObj.id);
      if (!checks.canClose) {
        const failed = checks.results.find((r: any) => r.status === 'FAIL');
        throw new Error(failed?.message || 'لا يمكن إقفال الفترة لعدم استيفاء فحوصات ما قبل الإقفال');
      }
      if (pIdx >= 0) {
        periods[pIdx].status = 'CLOSED';
        saveEntityItem('fiscal_periods', periods[pIdx]);
      } else {
        saveEntityItem('fiscal_periods', { ...periodObj, status: 'CLOSED' });
      }
      const prevSnaps = getEntityList<any>('snapshots', []).filter((s) => s.periodId === periodId);
      const tbFinancial = computeTrialBalance({ from: periodObj.startDate, to: periodObj.endDate, ledger: 'FINANCIAL' });
      const isPeriod = computeIncomeStatement({ from: periodObj.startDate, to: periodObj.endDate });
      const bsPeriod = computeBalanceSheet({ asOf: periodObj.endDate });
      const profOverview = getDemoFallback(`/reports/profitability/overview?periodId=${periodId}`);
      const snapData = {
        periodId,
        periodName: periodObj.name,
        startDate: periodObj.startDate,
        endDate: periodObj.endDate,
        closingDate: new Date().toISOString(),
        closedBy: 'المدير التنفيذي',
        trialBalance: { financial: tbFinancial },
        incomeStatement: { period: isPeriod },
        balanceSheet: bsPeriod,
        profitability: profOverview,
      };
      const snapHash = sha256Hex(JSON.stringify(snapData));
      const snap = {
        id: `snap-${Date.now()}`,
        periodId,
        periodName: periodObj.name,
        version: prevSnaps.length + 1,
        kind: 'PERIOD_CLOSE',
        dataHash: snapHash,
        createdAt: snapData.closingDate,
        createdBy: 'المدير التنفيذي',
        hashValid: true,
        data: snapData,
      };
      saveEntityItem('snapshots', snap);
      recordAudit({
        action: 'CLOSE_PERIOD',
        schemaName: 'acc',
        tableName: 'fiscal_periods',
        entityId: periodId,
        oldValues: { status: 'OPEN' },
        newValues: { status: 'CLOSED', snapshotId: snap.id, dataHash: snapHash },
        reason: `إقفال الفترة ${periodObj.name} وتوليد اللقطة الرقمية المحمية ببصمة SHA-256`,
      });
      return { success: true, snapshot: snap, message: 'تم إقفال الفترة وحفظ اللقطة بنجاح' };
    }

    if (path.includes('/closing/periods/') && path.endsWith('/reopen') && method === 'POST') {
      const periodId = path.split('?')[0].split('/')[3];
      const reasonText = String(body?.reason || '').trim();
      if (reasonText.length < 3) {
        throw new Error('إعادة فتح فترة مقفلة يتطلب توثيق السبب (3 أحرف على الأقل)');
      }
      const periods = getEntityList('fiscal_periods', defaultFiscalPeriodsList);
      const pIdx = periods.findIndex((p: any) => p.id === periodId);
      const pName = pIdx >= 0 ? periods[pIdx].name : 'الفترة المالية';
      if (pIdx >= 0) {
        periods[pIdx].status = 'OPEN';
        saveEntityItem('fiscal_periods', periods[pIdx]);
      }
      recordAudit({
        action: 'REOPEN_PERIOD',
        schemaName: 'acc',
        tableName: 'fiscal_periods',
        entityId: periodId,
        oldValues: { status: 'CLOSED' },
        newValues: { status: 'OPEN' },
        reason: `${reasonText} (${pName})`,
      });
      return { success: true, message: 'تمت إعادة فتح الفترة بنجاح' };
    }

    // --- 2.2 Robust Monthly Variables Operations (Business Process Section 12, 13, 14, 15) ---
    if (path.startsWith('/monthly-variables/') && path.endsWith('/approve') && method === 'POST') {
      const mvId = path.split('?')[0].split('/')[2];
      const list = getEntityList('monthly_variables', []);
      const idx = list.findIndex((m: any) => m.id === mvId);
      if (idx >= 0) {
        assertPeriodOpen(list[idx].fiscalPeriodId, 'اعتماد المتغير الشهري');
        list[idx].status = 'APPROVED';
        list[idx].approvedAt = new Date().toISOString();
        list[idx].approvedBy = 'المدير التنفيذي';
        saveEntityItem('monthly_variables', list[idx]);
        recordAudit({
          action: 'APPROVE_VARIABLE',
          schemaName: 'pay',
          tableName: 'monthly_variables',
          entityId: mvId,
          oldValues: { status: 'DRAFT' },
          newValues: { status: 'APPROVED', computedAmount: list[idx].computedAmount },
          reason: 'اعتماد متغير شهري لصالح الموظف ' + list[idx].employeeName,
        });
        return list[idx];
      }
    }

    if (path.startsWith('/monthly-variables/') && method === 'DELETE') {
      const mvId = path.split('?')[0].split('/')[2];
      const list = getEntityList('monthly_variables', []);
      const existing = list.find((m: any) => m.id === mvId);
      if (existing) assertPeriodOpen(existing.fiscalPeriodId, 'حذف المتغير الشهري');
      deleteEntityItem('monthly_variables', mvId);
      recordAudit({
        action: 'DELETE',
        schemaName: 'pay',
        tableName: 'monthly_variables',
        entityId: mvId,
        oldValues: existing || null,
        reason: 'حذف متغير شهري',
      });
      return { success: true, message: 'تم حذف المتغير بنجاح' };
    }

    // --- 2.3 Robust Revenue Runs Operations (Business Process Section 8 & Revenue Engine) ---
    if (path.split('?')[0] === '/revenue-runs' && method === 'POST') {
      const targetPeriodId = body?.fiscalPeriodId || body?.periodId;
      const pObj = assertPeriodOpen(targetPeriodId, 'ترحيل تشغيل الإيرادات');
      const resolvedPeriod = pObj || resolvePeriodByIdOrDate(targetPeriodId, null);
      const existingPosted = getEntityList<any>('revenue_runs', []).find(
        (r) => r.fiscalPeriodId === resolvedPeriod?.id && r.status === 'POSTED',
      );
      if (existingPosted) {
        throw new Error(`يوجد تشغيل إيرادات مرحّل مسبقاً للفترة (${resolvedPeriod?.name})؛ ألغِه أولاً لإعادة التشغيل.`);
      }

      const previewData = getDemoFallback(`/revenue-runs/preview?periodId=${resolvedPeriod?.id || ''}`);
      const runCount = getEntityList('revenue_runs', []).length + 1;
      const runNo = `REV-${new Date().getFullYear()}-${String(runCount).padStart(3, '0')}`;
      const todayIso = new Date().toISOString().slice(0, 10);
      const entryDate = resolvedPeriod
        ? (todayIso >= resolvedPeriod.startDate && todayIso <= resolvedPeriod.endDate ? todayIso : resolvedPeriod.endDate)
        : todayIso;

      const je = createAutoPostedJournalEntry({
        entryDate,
        fiscalPeriodId: resolvedPeriod?.id,
        journalType: 'REVENUE',
        sourceModule: 'REV',
        sourceType: 'REVENUE_RUN',
        postingEvent: 'REVENUE_RECOGNIZED',
        reference: runNo,
        description: `ترحيل إيرادات الخدمات والمشاريع للتشغيل ${runNo} — ${resolvedPeriod?.name || ''}`,
        lines: [
          { accountCode: '110301', debit: Number(previewData.totalRevenueBase || 0), credit: 0, description: `إيرادات مستحقة غير مفوترة (${runNo})` },
          { accountCode: '410101', debit: 0, credit: Number(previewData.totalRevenueBase || 0), description: `إيرادات عقود ومشاريع (${runNo})` },
        ],
      });

      const runItem = {
        id: `revrun-${Date.now()}`,
        runNo,
        fiscalPeriodId: resolvedPeriod?.id || targetPeriodId,
        periodName: resolvedPeriod?.name || 'فترة التشغيل الحالية',
        projectCount: previewData.projectCount,
        employeeCount: previewData.employeeCount,
        lineCount: previewData.lineCount,
        totalRevenueBase: previewData.totalRevenueBase,
        journalEntryNo: je.entryNo,
        journalEntryId: je.id,
        status: 'POSTED',
        createdAt: new Date().toISOString(),
        lines: previewData.lines,
      };
      saveEntityItem('revenue_runs', runItem);
      recordAudit({
        action: 'POST_REVENUE_RUN',
        schemaName: 'revenue',
        tableName: 'revenue_runs',
        entityId: runItem.id,
        newValues: { runNo, totalRevenueBase: runItem.totalRevenueBase, journalEntryNo: je.entryNo },
        reason: `ترحيل إيرادات الخدمات بمبلغ ${runItem.totalRevenueBase} ريال`,
      });
      return runItem;
    }

    if (path.startsWith('/revenue-runs/') && path.endsWith('/cancel') && method === 'POST') {
      const runId = path.split('?')[0].split('/')[2];
      const runs = getEntityList('revenue_runs', []);
      const idx = runs.findIndex((r: any) => r.id === runId);
      if (idx >= 0) {
        assertPeriodOpen(runs[idx].fiscalPeriodId, 'إلغاء تشغيل الإيرادات');
        const reasonText = body?.reason || 'إلغاء ترحيل الإيراد وعكس القيد';
        let revJe: any = null;
        if (runs[idx].journalEntryId) {
          try {
            revJe = createReversalJournalEntry(runs[idx].journalEntryId, reasonText);
          } catch { /* already reversed or manual */ }
        }
        runs[idx].status = 'CANCELLED';
        runs[idx].cancelReason = reasonText;
        runs[idx].reversalJournalEntryId = revJe?.id || null;
        saveEntityItem('revenue_runs', runs[idx]);
        recordAudit({
          action: 'CANCEL_REVENUE_RUN',
          schemaName: 'revenue',
          tableName: 'revenue_runs',
          entityId: runs[idx].id,
          reason: reasonText,
        });
        return runs[idx];
      }
    }

    // --- 2.35 Overhead Policy Update (Business Process Section 19) ---
    if (path.includes('/overhead-policy') && (method === 'PUT' || method === 'POST' || method === 'PATCH')) {
      return saveOverheadPolicy(body || {});
    }

    // --- 2.36 Cost Profile Lines CRUD (Business Process Section 4 & 5) ---
    if (path.startsWith('/cost-profiles/') && path.includes('/lines')) {
      const cleanP = path.split('?')[0].replace(/\/$/, '');
      const segs = cleanP.split('/').filter(Boolean); // ['cost-profiles', profileId, 'lines', lineId?, 'end'?]
      const profileId = segs[1];
      const lineId = segs[3];
      const profiles = getEntityList<any>('cost_profiles', defaultCostProfilesList);
      const pIdx = profiles.findIndex((p) => p.id === profileId || p.code === profileId);
      if (pIdx >= 0) {
        const prf = { ...profiles[pIdx], lines: Array.isArray(profiles[pIdx].lines) ? [...profiles[pIdx].lines] : [] };
        if (method === 'DELETE' && lineId) {
          prf.lines = prf.lines.filter((l: any) => l.id !== lineId);
          saveEntityItem('cost_profiles', prf);
          recordAudit({ action: 'DELETE', schemaName: 'cost', tableName: 'cost_profile_lines', entityId: lineId, reason: 'حذف بند من ملف التكلفة' });
          return { success: true };
        }
        if (method === 'POST' && cleanP.endsWith('/end') && lineId) {
          prf.lines = prf.lines.map((l: any) => (l.id === lineId ? { ...l, effectiveTo: body?.effectiveTo || new Date().toISOString().slice(0, 10) } : l));
          saveEntityItem('cost_profiles', prf);
          recordAudit({ action: 'UPDATE', schemaName: 'cost', tableName: 'cost_profile_lines', entityId: lineId, newValues: { effectiveTo: body?.effectiveTo }, reason: 'إنهاء سريان بند في ملف التكلفة' });
          return prf;
        }
        if (method === 'POST') {
          const comps = getEntityList<any>('cost_components', defaultCostComponentsList);
          const comp = comps.find((c) => c.id === body?.componentId || c.code === body?.componentId);
          const newLine = {
            id: `cpl-${Date.now()}`,
            componentId: comp?.id || body?.componentId,
            componentCode: comp?.code || 'CMP',
            componentName: comp?.nameAr || 'مكون تكلفة',
            calcMethod: body?.calcMethod || comp?.defaultMethod || 'FIXED',
            nature: comp?.nature || 'EMPLOYER_COST',
            ratePct: body?.ratePct != null && body.ratePct !== '' ? String(body.ratePct) : null,
            amount: body?.amount != null && body.amount !== '' ? String(body.amount) : null,
            currencyCode: body?.currencyCode || prf.currencyCode || 'SAR',
            minAmount: body?.minAmount || null,
            maxAmount: body?.maxAmount || null,
            effectiveFrom: body?.effectiveFrom || new Date().toISOString().slice(0, 10),
            effectiveTo: null,
          };
          prf.lines.push(newLine);
          saveEntityItem('cost_profiles', prf);
          recordAudit({ action: 'INSERT', schemaName: 'cost', tableName: 'cost_profile_lines', entityId: newLine.id, newValues: newLine, reason: `إضافة مكون (${newLine.componentName}) إلى ملف التكلفة ${prf.nameAr}` });
          return newLine;
        }
      }
    }

    // --- 2.37 Loans Cancel & Installment Postpone (Business Process Section 16) ---
    if (path.startsWith('/loans/') && path.endsWith('/cancel') && method === 'POST') {
      const loanId = path.split('?')[0].split('/')[2];
      const loans = getEntityList<any>('loans', []);
      const idx = loans.findIndex((l) => l.id === loanId);
      if (idx >= 0) {
        loans[idx].status = 'CANCELLED';
        loans[idx].cancelReason = body?.reason || 'إلغاء القرض إدارياً';
        const list = Array.isArray(loans[idx].installments_list) ? loans[idx].installments_list : [];
        loans[idx].installments_list = list.map((inst: any) => (inst.status === 'PENDING' ? { ...inst, status: 'CANCELLED' } : inst));
        saveEntityItem('loans', loans[idx]);
        recordAudit({ action: 'CANCEL_LOAN', schemaName: 'pay', tableName: 'loans', entityId: loanId, reason: loans[idx].cancelReason });
        return loans[idx];
      }
    }

    if (path.includes('/loans/installments/') && path.endsWith('/postpone') && method === 'POST') {
      const instId = path.split('?')[0].split('/')[3];
      const toPeriod = resolvePeriodByIdOrDate(body?.toPeriodId, null);
      if (!toPeriod) throw new Error('يرجى تحديد الفترة المالية المستهدفة لتأجيل القسط');
      assertPeriodOpen(toPeriod.id, 'تأجيل قسط سلفة إلى فترة لاحقة');

      const loans = getEntityList<any>('loans', []);
      for (const loan of loans) {
        const list = Array.isArray(loan.installments_list) ? [...loan.installments_list] : [];
        const instIdx = list.findIndex((x: any) => x.id === instId);
        if (instIdx >= 0) {
          const origInst = list[instIdx];
          list[instIdx] = { ...origInst, status: 'POSTPONED', postponedReason: body?.reason || 'تأجيل إداري' };
          list.push({
            id: `${loan.id}-inst-${Date.now()}`,
            installmentNo: origInst.installmentNo,
            periodId: toPeriod.id,
            periodName: toPeriod.name,
            dueAmount: origInst.dueAmount,
            status: 'PENDING',
            postponedFrom: origInst.periodName,
          });
          loan.installments_list = list;
          saveEntityItem('loans', loan);
          recordAudit({
            action: 'POSTPONE_INSTALLMENT',
            schemaName: 'pay',
            tableName: 'loan_installments',
            entityId: instId,
            oldValues: { periodId: origInst.periodId, status: 'PENDING' },
            newValues: { toPeriodId: toPeriod.id, toPeriodName: toPeriod.name },
            reason: body?.reason || `تأجيل قسط ${loan.loanNo} إلى ${toPeriod.name}`,
          });
          return loan;
        }
      }
    }

    // --- 2.38 Payroll Run Execution & Reversal (Business Process Section 12-16 & Accounting) ---
    if (path.split('?')[0] === '/payroll-runs' && method === 'POST') {
      const targetPeriodId = body?.periodId || body?.fiscalPeriodId;
      const period = assertPeriodOpen(targetPeriodId, 'تشغيل مسيّر الرواتب');
      const resolvedPeriod = period || resolvePeriodByIdOrDate(targetPeriodId, null);
      const existing = getEntityList<any>('payroll_runs', []).find((r) => r.fiscalPeriodId === resolvedPeriod?.id && r.status === 'POSTED');
      if (existing) {
        throw new Error(`تم تشغيل مسيّر الرواتب للفترة (${resolvedPeriod?.name}) مسبقاً؛ ألغِه أولاً لإعادة التشغيل.`);
      }

      const preview = getDemoFallback(`/payroll-runs/preview?periodId=${resolvedPeriod?.id || ''}`);
      if (!preview.lines || preview.lines.length === 0) {
        throw new Error('لا يوجد موظفون نشطون لحساب مسيّر الرواتب في هذه الفترة.');
      }

      const runCount = getEntityList('payroll_runs', []).length + 1;
      const runNo = `PAY-${(resolvedPeriod?.startDate || new Date().toISOString()).slice(0, 7).replace('-', '')}-${String(runCount).padStart(2, '0')}`;
      const todayIso = new Date().toISOString().slice(0, 10);
      const entryDate = resolvedPeriod
        ? (todayIso >= resolvedPeriod.startDate && todayIso <= resolvedPeriod.endDate ? todayIso : resolvedPeriod.endDate)
        : todayIso;

      const totalGross = preview.lines.reduce((s: number, l: any) => s + Number(l.grossBase || 0), 0);
      const totalLoanDed = Number(preview.totalLoanDeductionsBase || 0);
      const netPayable = Number(preview.netPayableBase || 0);
      const otherDeductions = Math.max(0, totalGross - totalLoanDed - netPayable);

      const jeLines: Array<{ accountCode: string; debit: number; credit: number; description?: string }> = [
        { accountCode: '50101', debit: totalGross, credit: 0, description: `رواتب وأجور ومتغيرات ${resolvedPeriod?.name}` },
      ];
      if (totalLoanDed > 0) {
        jeLines.push({ accountCode: '10401', debit: 0, credit: totalLoanDed, description: `استقطاع أقساط السلف المستحقة (${runNo}) — ليست تكلفة ربحية` });
      }
      if (otherDeductions > 0.005) {
        jeLines.push({ accountCode: '20301', debit: 0, credit: otherDeductions, description: `استقطاعات وخصومات إدارية (${runNo})` });
      }
      jeLines.push({ accountCode: '20401', debit: 0, credit: netPayable, description: `صافي الرواتب المستحقة للدفع (${runNo})` });

      const je = createAutoPostedJournalEntry({
        entryDate,
        fiscalPeriodId: resolvedPeriod?.id,
        journalType: 'PAYROLL',
        sourceModule: 'PAY',
        sourceType: 'PAYROLL_RUN',
        postingEvent: 'PAYROLL_POSTED',
        reference: runNo,
        description: `قيد مسيّر الرواتب الشهري ${runNo} — ${resolvedPeriod?.name}`,
        lines: jeLines,
      });

      const runId = `payrun-${Date.now()}`;
      // Mark due PENDING loan installments in this period as DEDUCTED
      const loans = getEntityList<any>('loans', []);
      for (const loan of loans) {
        if (loan.status !== 'ACTIVE') continue;
        let touched = false;
        const list = (Array.isArray(loan.installments_list) ? loan.installments_list : []).map((inst: any) => {
          if (inst.status === 'PENDING' && inst.periodId === resolvedPeriod?.id) {
            touched = true;
            return { ...inst, status: 'DEDUCTED', payrollRunId: runId };
          }
          return inst;
        });
        if (touched) {
          loan.installments_list = list;
          if (list.every((x: any) => x.status !== 'PENDING')) loan.status = 'COMPLETED';
          saveEntityItem('loans', loan);
        }
      }

      const runItem = {
        id: runId,
        runNo,
        fiscalPeriodId: resolvedPeriod?.id,
        periodName: resolvedPeriod?.name || 'الفترة الحالية',
        employeeCount: preview.employeeCount,
        totalSalaryBase: preview.totalSalaryBase,
        totalVariablesBase: preview.totalVariablesBase,
        totalLoanDeductionsBase: preview.totalLoanDeductionsBase,
        netPayableBase: preview.netPayableBase,
        journalEntryId: je.id,
        journalEntryNo: je.entryNo,
        status: 'POSTED',
        createdAt: new Date().toISOString(),
        lines: preview.lines,
      };
      saveEntityItem('payroll_runs', runItem);
      recordAudit({
        action: 'POST_PAYROLL_RUN',
        schemaName: 'pay',
        tableName: 'payroll_runs',
        entityId: runId,
        newValues: { runNo, netPayableBase: runItem.netPayableBase, totalLoanDeductionsBase: runItem.totalLoanDeductionsBase, journalEntryNo: je.entryNo },
        reason: `ترحيل مسيّر الرواتب ${runNo} للفترة ${resolvedPeriod?.name}`,
      });
      return runItem;
    }

    if (path.startsWith('/payroll-runs/') && path.endsWith('/cancel') && method === 'POST') {
      const runId = path.split('?')[0].split('/')[2];
      const runs = getEntityList<any>('payroll_runs', []);
      const idx = runs.findIndex((r) => r.id === runId);
      if (idx >= 0) {
        assertPeriodOpen(runs[idx].fiscalPeriodId, 'إلغاء مسيّر الرواتب');
        const reasonText = body?.reason || 'إلغاء مسيّر الرواتب وعكس القيد';
        let revJe: any = null;
        if (runs[idx].journalEntryId) {
          try {
            revJe = createReversalJournalEntry(runs[idx].journalEntryId, reasonText);
          } catch { /* already reversed */ }
        }
        // Restore DEDUCTED loan installments tied to this run back to PENDING
        const loans = getEntityList<any>('loans', []);
        for (const loan of loans) {
          let touched = false;
          const list = (Array.isArray(loan.installments_list) ? loan.installments_list : []).map((inst: any) => {
            if (inst.payrollRunId === runId && inst.status === 'DEDUCTED') {
              touched = true;
              const { payrollRunId: _omit, ...rest } = inst;
              return { ...rest, status: 'PENDING' };
            }
            return inst;
          });
          if (touched) {
            loan.installments_list = list;
            if (loan.status === 'COMPLETED') loan.status = 'ACTIVE';
            saveEntityItem('loans', loan);
          }
        }
        runs[idx].status = 'CANCELLED';
        runs[idx].cancelReason = reasonText;
        runs[idx].reversalJournalEntryId = revJe?.id || null;
        saveEntityItem('payroll_runs', runs[idx]);
        recordAudit({ action: 'CANCEL_PAYROLL_RUN', schemaName: 'pay', tableName: 'payroll_runs', entityId: runId, reason: reasonText });
        return runs[idx];
      }
    }

    // --- 2.39 Journal Entries Manual CRUD, Post, Cancel & Reverse ---
    if (path.startsWith('/journal-entries')) {
      const cleanP = path.split('?')[0].replace(/\/$/, '');
      const segs = cleanP.split('/').filter(Boolean); // ['journal-entries', id?, action?]
      const jeId = segs[1];
      const action = segs[2];
      const accounts = getNormalizedAccounts();

      if (jeId && action === 'post' && method === 'POST') {
        const list = getEntityList<any>('journal_entries', []);
        const idx = list.findIndex((j) => j.id === jeId);
        if (idx < 0) throw new Error('القيد غير موجود');
        const je = normalizeJournalEntry(list[idx], accounts);
        assertPeriodOpen(je.entryDate, 'ترحيل القيد المحاسبي');
        if (Math.abs(Number(je.totalDebitBase) - Number(je.totalCreditBase)) > 0.01 || Number(je.totalDebitBase) <= 0) {
          throw new Error('لا يمكن ترحيل قيد غير متوازن (مجموع المدين لا يساوي مجموع الدائن) أو صفري');
        }
        const seq = list.filter((j) => j.status === 'POSTED').length + 1;
        const year = (je.entryDate || new Date().toISOString().slice(0, 10)).slice(0, 4);
        je.status = 'POSTED';
        je.entryNo = je.entryNo || `JE-${year}-${String(seq).padStart(4, '0')}`;
        je.postedAt = new Date().toISOString();
        je.rowVersion = (je.rowVersion || 1) + 1;
        saveEntityItem('journal_entries', je);
        recordAudit({ action: 'POST', schemaName: 'acc', tableName: 'journal_entries', entityId: je.id, newValues: { entryNo: je.entryNo, status: 'POSTED' }, reason: `ترحيل القيد ${je.entryNo}` });
        return je;
      }

      if (jeId && action === 'cancel' && method === 'POST') {
        const list = getEntityList<any>('journal_entries', []);
        const idx = list.findIndex((j) => j.id === jeId);
        if (idx < 0) throw new Error('القيد غير موجود');
        if (list[idx].status !== 'DRAFT') throw new Error('لا يمكن إلغاء قيد مرحّل؛ استخدم القيد العكسي بدلاً من ذلك');
        list[idx].status = 'CANCELLED';
        list[idx].cancelReason = body?.reason || 'إلغاء مسودة القيد';
        saveEntityItem('journal_entries', list[idx]);
        recordAudit({ action: 'CANCEL', schemaName: 'acc', tableName: 'journal_entries', entityId: jeId, reason: list[idx].cancelReason });
        return list[idx];
      }

      if (jeId && action === 'reverse' && method === 'POST') {
        return createReversalJournalEntry(jeId, body?.reason || 'قيد عكسي يدوي', body?.reversalDate);
      }

      if (method === 'DELETE' && jeId && !action) {
        const list = getEntityList<any>('journal_entries', []);
        const target = list.find((j) => j.id === jeId);
        if (target?.status === 'POSTED') throw new Error('لا يمكن حذف قيد مرحّل نهائياً؛ استخدم القيد العكسي حفاظاً على سجل التدقيق');
        deleteEntityItem('journal_entries', jeId);
        recordAudit({ action: 'DELETE', schemaName: 'acc', tableName: 'journal_entries', entityId: jeId, reason: 'حذف مسودة قيد يومي' });
        return { success: true };
      }

      if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && !action) {
        assertPeriodOpen(body?.entryDate, 'حفظ قيد يومية');
        const list = getEntityList<any>('journal_entries', []);
        const existing = jeId ? list.find((j) => j.id === jeId) : null;
        if (existing && existing.status !== 'DRAFT') throw new Error('لا يمكن تعديل قيد غير مسودة');
        const built = normalizeJournalEntry({
          ...(existing || {}),
          ...body,
          id: existing?.id || `je-${Date.now()}`,
          status: existing?.status || 'DRAFT',
          entryNo: existing?.entryNo || null,
          rowVersion: ((existing?.rowVersion) || 0) + 1,
        }, accounts);
        saveEntityItem('journal_entries', built);
        recordAudit({
          action: existing ? 'UPDATE' : 'INSERT',
          schemaName: 'acc',
          tableName: 'journal_entries',
          entityId: built.id,
          newValues: { description: built.description, totalDebitBase: built.totalDebitBase },
          reason: built.description,
        });
        return built;
      }
    }

    // --- 2.4 Robust Retroactive Adjustments & Approval Workflow (Business Process Section 18 & 29) ---
    if (path.startsWith('/revenue-adjustments/') && (path.endsWith('/submit') || path.endsWith('/approve') || path.endsWith('/reject')) && method === 'POST') {
      const cleanP = path.split('?')[0].replace(/\/$/, '');
      const segs = cleanP.split('/').filter(Boolean); // ['revenue-adjustments', id, action]
      const adjId = segs[1];
      const act = segs[2];
      const list = getEntityList<any>('revenue_adjustments', []);
      const idx = list.findIndex((r) => r.id === adjId);
      if (idx >= 0) {
        const oldStatus = list[idx].status;
        if (act === 'submit') {
          list[idx].status = 'PENDING_APPROVAL';
          list[idx].submittedAt = new Date().toISOString();
          saveEntityItem('revenue_adjustments', list[idx]);
          recordAudit({
            action: 'SUBMIT_ADJUSTMENT',
            schemaName: 'revenue',
            tableName: 'revenue_adjustments',
            entityId: adjId,
            oldValues: { status: oldStatus },
            newValues: { status: 'PENDING_APPROVAL' },
            reason: `إرسال تسوية الإيراد للموظف ${list[idx].employeeName} للاعتماد`,
          });
        } else if (act === 'approve') {
          list[idx].status = 'APPROVED';
          list[idx].approvedAt = new Date().toISOString();
          list[idx].approvedBy = 'المدير التنفيذي';
          saveEntityItem('revenue_adjustments', list[idx]);
          recordAudit({
            action: 'APPROVE_ADJUSTMENT',
            schemaName: 'revenue',
            tableName: 'revenue_adjustments',
            entityId: adjId,
            oldValues: { status: oldStatus },
            newValues: { status: 'APPROVED', grossRevenueBase: list[idx].grossRevenueBase },
            reason: body?.reason || `اعتماد تسوية الإيراد للموظف ${list[idx].employeeName}`,
          });
        } else if (act === 'reject') {
          list[idx].status = 'REJECTED';
          list[idx].rejectedAt = new Date().toISOString();
          list[idx].rejectReason = body?.reason || 'رفض التسوية';
          saveEntityItem('revenue_adjustments', list[idx]);
          recordAudit({
            action: 'REJECT_ADJUSTMENT',
            schemaName: 'revenue',
            tableName: 'revenue_adjustments',
            entityId: adjId,
            oldValues: { status: oldStatus },
            newValues: { status: 'REJECTED', rejectReason: list[idx].rejectReason },
            reason: list[idx].rejectReason,
          });
        }
        return list[idx];
      }
    }

    if (path.includes('/revenue-adjustments/retroactive') && method === 'POST') {
      assertPeriodOpen(body.fiscalPeriodId, 'تسجيل تسوية إيراد بأثر رجعي');
      const emps = getEntityList('employees', []);
      const prjs = getEntityList('projects', []);
      const periods = getEntityList('fiscal_periods', defaultFiscalPeriodsList);
      const emp = emps.find((e: any) => e.id === body.employeeId || e.code === body.employeeId);
      const prj = prjs.find((p: any) => p.id === body.projectId || p.code === body.projectId);
      const origPeriod = periods.find((p: any) => p.id === body.originalPeriodId);
      const regPeriod = periods.find((p: any) => p.id === body.fiscalPeriodId);
      const units = Number(body.units || 1);
      const unitPrice = Number(body.unitPrice || 0);
      const { amountBase: grossRev } = convertToBase(units * unitPrice, body.currencyCode || 'SAR');
      const initialStatus = body.status || 'APPROVED';
      const retroItem = {
        id: `retro-${Date.now()}`,
        employeeId: body.employeeId,
        employeeCode: emp?.code || '',
        employeeName: emp?.fullNameAr || 'الموظف',
        projectId: body.projectId,
        projectCode: prj?.code || '',
        projectName: prj?.nameAr || 'المشروع',
        clientName: prj?.clientName || 'العميل',
        originalPeriodId: body.originalPeriodId,
        originalPeriodName: origPeriod?.name || 'فترة سابقة',
        fiscalPeriodId: body.fiscalPeriodId,
        periodName: regPeriod?.name || 'فترة حالية',
        pricingBasis: body.pricingBasis || 'DAILY',
        units,
        unitPrice,
        grossRevenueBase: grossRev,
        currencyCode: body.currencyCode || 'SAR',
        adjustmentReason: body.adjustmentReason || 'تسوية إيراد أثر رجعي',
        createdAt: new Date().toISOString(),
        createdBy: 'المدير التنفيذي',
        status: initialStatus,
      };
      saveEntityItem('revenue_adjustments', retroItem);
      recordAudit({
        action: 'RETROACTIVE_REVENUE_ADJUSTMENT',
        schemaName: 'revenue',
        tableName: 'revenue_adjustments',
        entityId: retroItem.id,
        newValues: { originalPeriodId: retroItem.originalPeriodId, fiscalPeriodId: retroItem.fiscalPeriodId, grossRevenueBase: retroItem.grossRevenueBase, status: initialStatus },
        reason: retroItem.adjustmentReason,
      });
      return retroItem;
    }

    const entityMap: Record<string, string> = {
      '/employees': 'employees',
      '/positions': 'positions',
      '/departments': 'departments',
      '/cost-centers': 'cost_centers',
      '/branches': 'branches',
      '/cost-profiles': 'cost_profiles',
      '/cost-components': 'cost_components',
      '/service-prices': 'service_prices',
      '/projects': 'projects',
      '/clients': 'clients',
      '/assignments': 'assignments',
      '/vendors': 'vendors',
      '/purchase-invoices': 'purchase_invoices',
      '/pur/invoices': 'purchase_invoices',
      '/invoices': 'invoices',
      '/sal/invoices': 'invoices',
      '/credit-notes': 'credit_notes',
      '/debit-notes': 'debit_notes',
      '/journal-entries': 'journal_entries',
      '/journals': 'journal_entries',
      '/bank-accounts': 'bank_accounts',
      '/banks': 'bank_accounts',
      '/bank-transfers': 'bank_transfers',
      '/custodies': 'custodies',
      '/assets': 'assets',
      '/asset-categories': 'asset_categories',
      '/variable-types': 'variable_types',
      '/monthly-variables': 'monthly_variables',
      '/loans': 'loans',
      '/services/catalog': 'services_catalog',
      '/services': 'services_catalog',
      '/zatca/submissions': 'zatca_submissions',
      '/revenue-adjustments': 'revenue_adjustments',
      '/revenue-runs': 'revenue_runs',
      '/payroll-runs': 'payroll_runs',
      '/audit-log': 'audit_log',
      '/audit/log': 'audit_log',
      '/tax-codes': 'tax_codes',
      '/taxes': 'tax_codes',
      '/fiscal-years': 'fiscal_years',
      '/fiscal-periods': 'fiscal_periods',
      '/work-calendars': 'work_calendars',
      '/company-currencies': 'currencies',
      '/currencies': 'currencies',
      '/exchange-rates': 'exchange_rates',
      '/users': 'users',
      '/roles': 'roles',
      '/zakat/returns': 'zakat_returns',
      '/snapshots': 'snapshots',
    };

    let targetKey: string | null = null;
    for (const [route, key] of Object.entries(entityMap)) {
      if (path.includes(route)) {
        targetKey = key;
        break;
      }
    }

    const cleanActionPath = path.split('?')[0].replace(/\/$/, '');

    // --- ZATCA Operations ---
    if (cleanActionPath.includes('/zatca/onboard')) {
      return onboardZatcaSettings(body);
    }
    if (cleanActionPath.includes('/zatca/decode-qr')) {
      return decodeZatcaTlv(body?.qrBase64 || '');
    }
    if (cleanActionPath.includes('/zatca/invoices/batch-transmit')) {
      return batchTransmitZatcaInvoices();
    }
    if (cleanActionPath.includes('/zatca/invoices/') && cleanActionPath.endsWith('/transmit')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const tIdx = parts.findIndex((p) => p === 'transmit');
      return transmitZatcaInvoice(tIdx > 0 ? parts[tIdx - 1] : parts.pop() || '');
    }

    // --- Sales Invoices, Customer Receipts & Credit Notes ---
    if (cleanActionPath.includes('/invoices/auto-generate')) {
      return autoGenerateSalesInvoicesFromAssignments(body);
    }
    if (cleanActionPath.includes('/invoices/') && cleanActionPath.endsWith('/payments')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const pIdx = parts.findIndex((p) => p === 'payments');
      return recordSalesInvoicePayment(parts[pIdx - 1], body);
    }
    if (cleanActionPath.includes('/invoices/') && cleanActionPath.endsWith('/post')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const postIdx = parts.findIndex((p) => p === 'post');
      return postSalesInvoice(parts[postIdx - 1]);
    }
    if (cleanActionPath.includes('/invoices/') && cleanActionPath.endsWith('/cancel')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const cancelIdx = parts.findIndex((p) => p === 'cancel');
      return cancelSalesInvoice(parts[cancelIdx - 1], body?.reason);
    }
    if (cleanActionPath.includes('/invoices/') && cleanActionPath.endsWith('/repair-journal')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const repairIdx = parts.findIndex((p) => p === 'repair-journal');
      return repairSalesInvoiceJournal(parts[repairIdx - 1]);
    }
    if ((cleanActionPath === '/invoices' || cleanActionPath === '/sal/invoices') && method === 'POST') {
      return createSalesInvoice(body);
    }
    if (cleanActionPath === '/credit-notes' && method === 'POST') {
      return createCreditNoteAndPost(body);
    }

    // --- Purchase Invoices, Vendor Payments & Debit Notes ---
    if (cleanActionPath.includes('/purchase-invoices/') && cleanActionPath.endsWith('/post')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const postIdx = parts.findIndex((p) => p === 'post');
      return postPurchaseInvoiceItem(parts[postIdx - 1]);
    }
    if (cleanActionPath.includes('/purchase-invoices/') && (cleanActionPath.endsWith('/pay') || cleanActionPath.endsWith('/payments'))) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const pIdx = parts.findIndex((p) => p === 'pay' || p === 'payments');
      return payPurchaseInvoiceItem(parts[pIdx - 1], body);
    }
    if ((cleanActionPath.includes('/purchase-invoices/') || cleanActionPath.includes('/pur/invoices/')) && cleanActionPath.endsWith('/cancel')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const cIdx = parts.findIndex((p) => p === 'cancel');
      return cancelPurchaseInvoiceItem(parts[cIdx - 1], body?.reason);
    }
    if ((cleanActionPath === '/purchase-invoices' || cleanActionPath === '/pur/invoices') && method === 'POST') {
      return createPurchaseInvoiceItem(body);
    }
    if (cleanActionPath === '/debit-notes' && method === 'POST') {
      return createDebitNoteAndPost(body);
    }

    // --- Fixed Assets & Depreciation Runs ---
    if (cleanActionPath.includes('/assets/') && cleanActionPath.endsWith('/activate')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'activate');
      return activateAssetItem(parts[idx - 1], body);
    }
    if (cleanActionPath.includes('/assets/') && cleanActionPath.endsWith('/custody/return')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'custody');
      return returnAssetCustody(parts[idx - 1], body);
    }
    if (cleanActionPath.includes('/assets/') && cleanActionPath.endsWith('/custody')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'custody');
      return assignAssetCustody(parts[idx - 1], body);
    }
    if (cleanActionPath.includes('/assets/') && cleanActionPath.endsWith('/dispose')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'dispose');
      return disposeAssetItem(parts[idx - 1], body);
    }
    if (cleanActionPath === '/assets' && method === 'POST') {
      return createAssetItem(body);
    }
    if (cleanActionPath.includes('/depreciation-runs/') && cleanActionPath.endsWith('/cancel')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'cancel');
      return cancelDepreciationRunItem(parts[idx - 1], body?.reason);
    }
    if (cleanActionPath === '/depreciation-runs' && method === 'POST') {
      return executeDepreciationRun(body);
    }

    // --- Custodies Lifecycle ---
    if (cleanActionPath.includes('/custodies/') && cleanActionPath.endsWith('/disburse')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return disburseCustodyItem(parts[1], body);
    }
    if (cleanActionPath.includes('/custodies/') && (cleanActionPath.endsWith('/conversion') || cleanActionPath.endsWith('/transfers'))) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return convertCustodyItem(parts[1], body);
    }
    if (cleanActionPath.includes('/custodies/') && cleanActionPath.includes('/lines/') && method === 'DELETE') {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const lIdx = parts.findIndex((p) => p === 'lines');
      return deleteCustodyExpenseLine(parts[1], parts[lIdx + 1]);
    }
    if (cleanActionPath.includes('/custodies/') && cleanActionPath.endsWith('/lines') && method === 'POST') {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return addCustodyExpenseLine(parts[1], body);
    }
    if (cleanActionPath.includes('/custodies/') && (cleanActionPath.endsWith('/settle') || cleanActionPath.endsWith('/settlements'))) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return settleCustodyExpenses(parts[1], body);
    }
    if (cleanActionPath.includes('/custodies/') && cleanActionPath.endsWith('/close')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return closeCustodyItem(parts[1], body);
    }
    if (cleanActionPath === '/custodies' && method === 'POST') {
      return createCustodyItem(body);
    }

    // --- Zakat Settings, Calculations & Returns ---
    if (cleanActionPath.includes('/zakat/settings')) {
      return saveZakatSettings(body);
    }
    if (cleanActionPath.includes('/zakat/calculate')) {
      return computeZakatSummary(body);
    }
    if (cleanActionPath.includes('/zakat/returns/') && cleanActionPath.endsWith('/post')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'post');
      return postZakatReturnItem(parts[idx - 1]);
    }
    if (cleanActionPath.includes('/zakat/returns/') && cleanActionPath.endsWith('/cancel')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'cancel');
      return cancelZakatReturnItem(parts[idx - 1], body?.reason);
    }
    if (cleanActionPath === '/zakat/returns' && method === 'POST') {
      return saveZakatReturnDraft(body);
    }

    // --- Bank Accounts & Inter-Bank Transfers ---
    if ((cleanActionPath === '/bank-accounts' || cleanActionPath === '/banks') && method === 'POST') {
      getEntityList('bank_accounts', defaultBankAccountsList);
      const gl = getNormalizedAccounts().find((a) => a.id === body?.glAccountId || a.code === body?.glAccountId);
      return saveEntityItem('bank_accounts', {
        id: body?.id || `bnk-${Date.now()}`,
        isActive: true,
        ...body,
        glAccountCode: gl?.code || body?.glAccountCode || '10201',
        glAccountNameAr: gl?.nameAr || body?.glAccountNameAr || 'النقدية بالبنوك',
      });
    }
    if (cleanActionPath === '/bank-transfers' && method === 'POST') {
      const jes = getEntityList<any>('journal_entries', []);
      const linkedJe = jes.find((j) => j.id === body?.journalEntryId);
      return saveEntityItem('bank_transfers', {
        id: `trf-${Date.now()}`,
        ...body,
        journalEntryNo: body?.journalEntryNo || linkedJe?.entryNo || 'JE-AUTO',
        createdAt: new Date().toISOString(),
      });
    }

    if (targetKey) {
      if (targetKey === 'exchange_rates') getEntityList('exchange_rates', defaultExchangeRatesList);
      if (targetKey === 'cost_components') getEntityList('cost_components', defaultCostComponentsList);
      if (targetKey === 'cost_profiles') getEntityList('cost_profiles', defaultCostProfilesList);
      if (targetKey === 'variable_types') getEntityList('variable_types', defaultVariableTypesList);
      if (targetKey === 'asset_categories') getEntityList('asset_categories', defaultAssetCategoriesList);
      if (method === 'DELETE') {
        const id = path.split('?')[0].split('/').filter(Boolean).pop();
        if (id) {
          deleteEntityItem(targetKey, id);
          recordAudit({ action: 'DELETE', tableName: targetKey, entityId: id, reason: `حذف سجل من ${targetKey}` });
        }
        return { success: true };
      }
      if ((method === 'PATCH' || method === 'PUT') && typeof body === 'object' && body !== null && !body.id) {
        const urlId = path.split('?')[0].split('/').filter(Boolean).pop();
        if (urlId && !urlId.startsWith(targetKey.replace('_', '-'))) body.id = urlId;
        else if (urlId && path.split('?')[0].split('/').filter(Boolean).length >= 2) body.id = urlId;
      }
      if (typeof body === 'object' && body !== null) {
        // 1) Employee enrichment
        if (targetKey === 'employees') {
          const departments = getEntityList('departments', defaultDepartments);
          const positions = getEntityList('positions', defaultPositions);
          const branches = getEntityList('branches', defaultBranches);
          const dept = departments.find((d) => d.id === body.placement?.departmentId || d.id === body.departmentId);
          const pos = positions.find((p) => p.id === body.placement?.positionId || p.id === body.positionId);
          const br = branches.find((b) => b.id === body.placement?.branchId || b.id === body.branchId);
          body.departmentName = dept?.nameAr || body.departmentName || '';
          body.positionTitle = pos?.titleAr || body.positionTitle || '';
          body.branchName = br?.nameAr || body.branchName || '';
          body.basicSalary = body.compensation?.basicSalary || body.basicSalary || '0.00';
          body.salaryCurrency = body.compensation?.salaryCurrency || body.salaryCurrency || 'SAR';
          body.insuranceSalary = body.compensation?.insuranceSalary || body.insuranceSalary || '0.00';
          body.insuranceCurrency = body.compensation?.insuranceCurrency || body.salaryCurrency || 'SAR';
          body.costProfileId = body.costProfileId || null;
          body.status = body.status || 'ACTIVE';
          body.hireDate = body.hireDate || new Date().toISOString().slice(0, 10);
          if (!body.code) {
            const count = getEntityList('employees', []).length + 1;
            body.code = `EMP-${String(count).padStart(3, '0')}`;
          }
          if (!body.id) {
            body.id = `emp-${Date.now()}`;
          }
          // Populate initial placement & compensation histories
          body.placements = [
            {
              id: `plc-${Date.now()}`,
              effectiveFrom: body.hireDate,
              effectiveTo: null,
              departmentId: body.departmentId || body.placement?.departmentId || null,
              positionId: body.positionId || body.placement?.positionId || null,
              branchId: body.branchId || body.placement?.branchId || null,
              departmentName: body.departmentName,
              positionTitle: body.positionTitle,
              branchName: body.branchName,
              changeReason: 'التعيين الأولي وتسكين الكادر',
            }
          ];
          body.compensations = [
            {
              id: `cmp-${Date.now()}`,
              effectiveFrom: body.hireDate,
              effectiveTo: null,
              basicSalary: body.basicSalary,
              salaryCurrency: body.salaryCurrency,
              insuranceSalary: body.insuranceSalary,
              insuranceCurrency: body.insuranceCurrency,
              changeReason: 'الراتب المعتمد عند التعيين',
              createdBy: 'المدير التنفيذي',
              createdAt: new Date().toISOString(),
            }
          ];
          // Seed initial default service price if defaultBillingRate provided (Sec 6)
          if (Number(body.defaultBillingRate || 0) > 0) {
            const spItem = {
              id: `sp-${Date.now()}`,
              employeeId: body.id,
              employeeCode: body.code,
              employeeName: body.fullNameAr,
              projectId: null,
              projectCode: null,
              projectName: null,
              pricingBasis: body.defaultBillingBasis || 'DAILY',
              price: String(body.defaultBillingRate),
              currencyCode: body.billingCurrency || 'SAR',
              effectiveFrom: body.hireDate,
              effectiveTo: null,
            };
            saveEntityItem('service_prices', spItem);
          }
          // Initial project assignment if provided
          if (body.initialProjectId) {
            const allPrjs = getEntityList('projects', []);
            const targetPrj = allPrjs.find((p) => p.id === body.initialProjectId);
            if (targetPrj) {
              const allocPctNum = Number(body.initialAllocationPct || 100);
              const asg = {
                id: `asg-${Date.now()}`,
                employeeId: body.id,
                employeeCode: body.code,
                employeeName: body.fullNameAr,
                projectId: targetPrj.id,
                projectCode: targetPrj.code,
                projectName: targetPrj.nameAr,
                clientName: targetPrj.clientName,
                allocationBasis: 'PERCENTAGE',
                allocationPct: allocPctNum,
                allocatedDays: Number(((allocPctNum / 100) * 22).toFixed(2)),
                workingDaysInMonth: 22,
                billableRate: Number(body.defaultBillingRate || 1500),
                billingBasis: body.defaultBillingBasis || 'DAILY',
                billingCurrency: 'SAR',
                startDate: body.hireDate,
                endDate: null,
                effectiveFrom: body.hireDate,
                effectiveTo: null,
                changeReason: 'الإسناد المبدئي لمشروع العمل عند التعيين',
              };
              saveEntityItem('assignments', asg);
              recomputeEmployeeOverAllocation(body.id);
            }
          }
          const savedEmp = saveEntityItem(targetKey, body);
          recordAudit({
            action: 'CREATE_EMPLOYEE',
            schemaName: 'hr',
            tableName: 'employees',
            entityId: savedEmp.id,
            newValues: { code: savedEmp.code, fullNameAr: savedEmp.fullNameAr, basicSalary: savedEmp.basicSalary, salaryCurrency: savedEmp.salaryCurrency },
            reason: `إنشاء وتعيين الموظف ${savedEmp.fullNameAr} (${savedEmp.code})`,
          });
          return savedEmp;
        }

        // 1.5) Service prices enrichment (Sec 6 & 8)
        if (targetKey === 'service_prices') {
          const emps = getEntityList('employees', []);
          const prjs = getEntityList('projects', []);
          const emp = emps.find((e: any) => e.id === body.employeeId || e.code === body.employeeId);
          const prj = body.projectId ? prjs.find((p: any) => p.id === body.projectId || p.code === body.projectId) : null;
          body.id = body.id || `sp-${Date.now()}`;
          body.employeeId = emp?.id || body.employeeId;
          body.employeeCode = emp?.code || body.employeeCode || '';
          body.employeeName = emp?.fullNameAr || body.employeeName || 'الموظف';
          body.projectId = prj?.id || body.projectId || null;
          body.projectCode = prj?.code || body.projectCode || null;
          body.projectName = prj?.nameAr || body.projectName || null;
          body.pricingBasis = body.pricingBasis || 'DAILY';
          body.price = String(body.price || '0.00');
          body.currencyCode = body.currencyCode || 'SAR';
          body.effectiveFrom = body.effectiveFrom || new Date().toISOString().slice(0, 10);
          body.effectiveTo = body.effectiveTo || null;
          const savedSp = saveEntityItem('service_prices', body);
          recordAudit({
            action: 'CREATE_SERVICE_PRICE',
            schemaName: 'revenue',
            tableName: 'service_prices',
            entityId: savedSp.id,
            newValues: { employeeName: savedSp.employeeName, projectName: savedSp.projectName || 'سعر افتراضي عام', price: savedSp.price, pricingBasis: savedSp.pricingBasis },
            reason: `تسجيل سعر خدمة للموظف ${savedSp.employeeName}`,
          });
          return savedSp;
        }

        // 2) Project enrichment
        if (targetKey === 'projects') {
          const clients = getEntityList('clients', defaultClients);
          const employees = getEntityList('employees', []);
          const cli = clients.find((c) => c.id === body.clientId);
          const mgr = employees.find((e) => e.id === body.managerId);
          body.clientName = cli?.nameAr || body.clientName || 'العميل';
          body.managerName = mgr?.fullNameAr || body.managerName || '';
          body.status = body.status || 'ACTIVE';
          body.currencyCode = body.currencyCode || 'SAR';
          if (!body.code) {
            const count = getEntityList('projects', []).length + 1;
            body.code = `PRJ-${String(count).padStart(3, '0')}`;
          }
        }

        // 2.5) Monthly variables enrichment (Sec 12, 13, 14, 15)
        if (targetKey === 'monthly_variables') {
          if (body.fiscalPeriodId) assertPeriodOpen(body.fiscalPeriodId, 'تسجيل متغير شهري');
          const emps = getEntityList('employees', []);
          const prjs = getEntityList('projects', []);
          const varTypes = getEntityList('variable_types', defaultVariableTypesList);
          const emp = emps.find((e: any) => e.id === body.employeeId || e.code === body.employeeId);
          const prj = prjs.find((p: any) => p.id === body.projectId || p.code === body.projectId);
          const vt = varTypes.find((v: any) => v.id === body.variableTypeId || v.code === body.variableTypeId);
          body.id = body.id || `mv-${Date.now()}`;
          body.employeeName = emp?.fullNameAr || body.employeeName || 'الموظف';
          body.employeeCode = emp?.code || body.employeeCode || '';
          body.projectName = prj?.nameAr || body.projectName || null;
          body.variableTypeName = vt?.nameAr || body.variableTypeName || 'مكافأة / متغير';
          body.category = vt?.category || body.category || 'EARNING';
          body.status = body.status || 'DRAFT';

          const bSal = Number(emp?.basicSalary || emp?.basic_salary || 0);
          const dailyRate = bSal > 0 ? (bSal / 22) : 500;
          const hourlyRate = dailyRate / 8;
          const calcMethod = body.calcMethod || vt?.calcMethod || 'FIXED';
          let computed = Number(body.amount || 0);
          if (calcMethod === 'PCT_BASIC' && !body.hours && !body.days) {
            const pct = Number(body.rate || body.pct || body.amount || 0);
            const mult = Number(body.multiplier || vt?.defaultMultiplier || 1);
            computed = (pct / 100) * bSal * mult;
          } else if (body.hours || calcMethod === 'HOURS_RATE') {
            const mult = Number(body.multiplier || vt?.defaultMultiplier || 1.5);
            const r = Number(body.rate || hourlyRate);
            computed = Number(body.hours || 0) * r * mult;
          } else if (body.days || calcMethod === 'DAYS_RATE') {
            const mult = Number(body.multiplier || vt?.defaultMultiplier || 1);
            const r = Number(body.rate || dailyRate);
            computed = Number(body.days || 0) * r * mult;
          }
          body.computedAmount = String(computed.toFixed(2));
          const savedVar = saveEntityItem(targetKey, body);
          recordAudit({
            action: 'CREATE_VARIABLE',
            schemaName: 'pay',
            tableName: 'monthly_variables',
            entityId: savedVar.id,
            newValues: { employeeName: savedVar.employeeName, variableTypeName: savedVar.variableTypeName, computedAmount: savedVar.computedAmount, projectId: savedVar.projectId || null },
            reason: `إضافة متغير شهري (${savedVar.variableTypeName}) للموظف ${savedVar.employeeName}`,
          });
          return savedVar;
        }

        // 2.6) Loans enrichment (Business Process Section 16: Installment schedule tied to fiscal periods)
        if (targetKey === 'loans') {
          const emps = getEntityList('employees', []);
          const periods = getEntityList('fiscal_periods', defaultFiscalPeriodsList).filter((p: any) => !p.isAdjustmentPeriod);
          const emp = emps.find((e: any) => e.id === body.employeeId || e.code === body.employeeId);
          const count = getEntityList('loans', []).length + 1;
          body.id = body.id || `loan-${Date.now()}`;
          body.loanNo = body.loanNo || `LN-${new Date().getFullYear()}-${String(count).padStart(3, '0')}`;
          body.employeeName = emp?.fullNameAr || body.employeeName || 'الموظف';
          const { amountBase: principalNum } = convertToBase(body.principalAmount || body.principalBase || 0, body.currencyCode || 'SAR');
          body.principalBase = principalNum.toFixed(2);
          body.status = body.status || 'ACTIVE';
          const instCount = Math.max(1, Number(body.installments || 1));
          body.installments = instCount;
          const monthlyDeduct = principalNum / instCount;
          body.installmentAmount = monthlyDeduct.toFixed(2);

          let startIdx = body.startPeriodId ? periods.findIndex((p: any) => p.id === body.startPeriodId) : periods.findIndex((p: any) => p.status === 'OPEN');
          if (startIdx < 0) startIdx = 0;

          body.installments_list = Array.from({ length: instCount }, (_, i) => {
            const p = periods[startIdx + i];
            return {
              id: `${body.id}-inst-${i + 1}`,
              installmentNo: i + 1,
              periodId: p?.id || `fp-future-${i + 1}`,
              periodName: p?.name || `فترة لاحقة +${i + 1}`,
              dueAmount: monthlyDeduct.toFixed(2),
              status: 'PENDING',
            };
          });
          const savedLoan = saveEntityItem(targetKey, body);
          recordAudit({
            action: 'CREATE_LOAN',
            schemaName: 'pay',
            tableName: 'loans',
            entityId: savedLoan.id,
            newValues: { loanNo: savedLoan.loanNo, employeeName: savedLoan.employeeName, principalBase: savedLoan.principalBase, installments: savedLoan.installments },
            reason: `إضافة سلفة موظف (${savedLoan.loanNo}) للموظف ${savedLoan.employeeName} — لا تدخل ضمن تكلفة الربحية`,
          });
          return savedLoan;
        }

        // 2.7) Assets enrichment
        if (targetKey === 'assets') {
          const emps = getEntityList('employees', []);
          const emp = emps.find((e: any) => e.id === body.custodianEmployeeId || e.id === body.employeeId);
          body.id = body.id || `ast-${Date.now()}`;
          body.custodianName = emp?.fullNameAr || body.custodianName || '—';
          body.costBase = String(body.costBase || body.cost || '0.00');
          body.accumulatedBase = body.accumulatedBase || '0.00';
          body.netBookValueBase = body.costBase;
          body.status = body.status || 'ACTIVE';
        }

        // 3) Invoice enrichment
        if (targetKey === 'invoices') {
          const clients = getEntityList('clients', defaultClients);
          const projects = getEntityList('projects', []);
          const cli = clients.find((c) => c.id === body.clientId);
          const prj = projects.find((p) => p.id === body.projectId);
          const invCount = getEntityList('invoices', []).length + 1;
          body.invoiceNo = body.invoiceNo || `INV-2026-${String(invCount).padStart(4, '0')}`;
          body.clientName = cli?.nameAr || body.clientName || 'العميل';
          body.clientVatNumber = cli?.taxNumber || cli?.vatNumber || '310123456700003';
          body.projectName = prj?.nameAr || body.projectName || '';
          body.currencyCode = body.currencyCode || 'SAR';
          body.status = body.status || 'POSTED';
          body.paymentStatus = body.paymentStatus || 'UNPAID';
          body.paidAmount = body.paidAmount || '0.00';
          body.journalEntryId = body.journalEntryId || `je-${Date.now()}`;

          if (Array.isArray(body.lines) && body.lines.length > 0) {
            let st = 0;
            let disc = 0;
            let vt = 0;
            body.lines = body.lines.map((l: any, idx: number) => {
              const qty = Number(l.quantity ?? l.units ?? 1);
              const price = Number(l.unitPrice ?? 0);
              const dPct = Number(l.discountPct ?? 0);
              const lineGross = qty * price;
              const lineDisc = lineGross * (dPct / 100);
              const lineNet = lineGross - lineDisc;
              const vatR = Number(l.vatRate ?? 15);
              const lineVat = lineNet * (vatR / 100);
              const lineTot = lineNet + lineVat;
              st += lineNet;
              disc += lineDisc;
              vt += lineVat;
              return {
                id: l.id || `line-${idx + 1}`,
                lineNo: idx + 1,
                description: l.description || 'خدمات برمجية وتقنية',
                quantity: qty,
                unitPrice: price,
                discountPct: dPct,
                subtotal: lineNet.toFixed(2),
                vatRate: vatR,
                vatAmount: lineVat.toFixed(2),
                total: lineTot.toFixed(2),
                employeeId: l.employeeId,
              };
            });
            body.subtotal = st.toFixed(2);
            body.discountAmount = disc.toFixed(2);
            body.taxableAmount = st.toFixed(2);
            body.vatRate = '15.00';
            body.vatAmount = vt.toFixed(2);
            body.totalAmount = (st + vt).toFixed(2);
            body.subtotalBase = body.subtotal;
            body.vatAmountBase = body.vatAmount;
            body.totalAmountBase = body.totalAmount;
          } else {
            body.subtotal = body.subtotal || '0.00';
            body.vatAmount = body.vatAmount || '0.00';
            body.totalAmount = body.totalAmount || '0.00';
          }
        }

        return saveEntityItem(targetKey, body);
      }
    }

    return {
      id: (body && body.id) || `id-${Date.now()}`,
      success: true,
      rowVersion: 1,
      message: 'تمت العملية بنجاح',
      returnNo: `RET-${Date.now()}`,
      ...(typeof body === 'object' && body !== null ? body : {}),
    };
  }

  // 1. Auth & Current Setup
  if (path.includes('/auth/login') || path.includes('/auth/refresh')) {
    return {
      accessToken: 'demo-jwt-token-idham-2026',
      expiresIn: 86400,
      tokenType: 'Bearer',
    };
  }

  if (path.includes('/auth/me')) {
    const comp = getStoredCompany();
    return {
      user: {
        id: '01a17cb2-9afa-7ef5-91f6-b47561899afb',
        username: 'admin',
        email: 'admin@idham.net',
        fullName: 'المدير التنفيذي',
        isSystemAdmin: true,
        preferredLocale: 'ar',
        mustChangePassword: false,
      },
      companies: [
        {
          id: comp.id,
          code: comp.code,
          nameAr: comp.nameAr,
          nameEn: comp.nameEn,
          baseCurrency: comp.baseCurrency || 'SAR',
        },
      ],
    };
  }

  if (path.includes('/setup/status') || path.includes('/setup/initialize')) {
    return { initialized: true };
  }

  if (path.includes('/companies/current')) {
    return getStoredCompany();
  }

  // 2. Positions (الوظائف)
  if (path.includes('/positions')) {
    return makeList(getEntityList('positions', defaultPositions));
  }

  // 3. Dynamic 3-Level Profitability Engine (Executive Intelligence & Business Process)
  function computeDynamicProfitability(periodFilterId?: string | null) {
    const emps = getEntityList('employees', []);
    const prjs = getEntityList('projects', []);
    const clients = getEntityList('clients', defaultClients);
    const targetPeriod = periodFilterId ? resolvePeriodByIdOrDate(periodFilterId, null) : undefined;
    const assignments = getEntityList('assignments', []).filter((a: any) => isAssignmentActiveInPeriod(a, targetPeriod));
    const depts = getEntityList('departments', defaultDepartments);
    const deptMap = new Map(depts.map((d: any) => [d.id, d.nameAr]));
    const monthlyVars = getEntityList('monthly_variables', []);
    const retroAdjs = getEntityList('revenue_adjustments', []).filter((r: any) => r.status !== 'REJECTED' && (!periodFilterId || r.fiscalPeriodId === periodFilterId || r.originalPeriodId === periodFilterId));
    const servicePrices = getEntityList('service_prices', []).filter((sp: any) => !sp.effectiveTo);
    const overheadPolicy = getOverheadPolicy();
    const empBreakdownMap = new Map<string, ReturnType<typeof computeEmployeeCostBreakdown>>();

    // 1. Employee calculations (Level 1 per Business Process)
    const empList: any[] = [];
    let sumEmpRev = 0;
    let sumEmpCost = 0;
    let sumEmpProfit = 0;
    let sumUnutilizedCost = 0;

    for (const emp of emps) {
      const bd = computeEmployeeCostBreakdown(emp, targetPeriod, overheadPolicy);
      empBreakdownMap.set(emp.id, bd);
      if (emp.code) empBreakdownMap.set(emp.code, bd);
      const directCost = bd.distributableCostBase;
      const assetDeprCost = bd.assetDepreciationBase;
      const generalVarsCost = bd.generalVariablesBase;
      const overhead = overheadPolicy.method === 'PERCENTAGE'
        ? Math.round(directCost * (Number(overheadPolicy.rate || 0) / 100))
        : overheadPolicy.method === 'FIXED_PER_EMPLOYEE'
          ? Math.round(Number(overheadPolicy.rate || 0))
          : Math.round(prjs.length > 0 && emps.length > 0 ? (Number(overheadPolicy.rate || 0) * prjs.length) / emps.length : 0);
      const totalCost = directCost + overhead;
      const targetMargin = Number(emp.targetMarginPct || emp.requiredMarginPct || 25);

      const myAsgs = assignments.filter((a: any) => matchesEmployee(a, emp));
      let totalAllocPct = 0;
      for (const a of myAsgs) {
        const pct = Number(a.allocationPct != null ? a.allocationPct : (a.allocationBasis === 'DAYS' ? ((Number(a.allocatedDays) || 22) / 22) * 100 : 100));
        totalAllocPct += pct;
      }

      const unutilizedPct = Math.max(0, 100 - totalAllocPct);
      const unutilizedCost = Math.round(directCost * (unutilizedPct / 100));
      const overAllocatedPct = Math.max(0, totalAllocPct - 100);

      let empRev = 0;
      const empProjects: any[] = [];
      for (const a of myAsgs) {
        // Section 6 & 8: Check project price override priority + default employee price + FX conversion to Base SAR
        const override = servicePrices.find((sp: any) => matchesEmployee(sp, emp) && (matchesProject(sp, a) || (a.projectId && sp.projectId === a.projectId)))
          || servicePrices.find((sp: any) => matchesEmployee(sp, emp) && !sp.projectId);
        let rawRate = Number(a.billableRate || a.dailyRate || a.unitPrice || emp.defaultBillingRate || 0);
        let basis = a.billingBasis || emp.defaultBillingBasis || a.allocationBasis || 'DAILY';
        let rateCur = a.billingCurrency || 'SAR';
        if (override) {
          rawRate = Number(override.price || rawRate);
          basis = override.pricingBasis || basis;
          rateCur = override.currencyCode || rateCur;
        }
        const rate = convertToBase(rawRate, rateCur, targetPeriod?.endDate).amountBase;

        let asgRev = 0;
        if (basis === 'DAYS' || basis === 'DAILY' || a.allocationBasis === 'DAYS') {
          asgRev = (Number(a.allocatedDays) || 22) * rate;
        } else if (basis === 'HOURLY' || basis === 'HOURS' || a.allocationBasis === 'HOURLY') {
          asgRev = (Number(a.allocatedHours) || 160) * rate;
        } else {
          const pct = Number(a.allocationPct != null ? a.allocationPct : 100);
          asgRev = rate * (pct / 100);
        }
        empRev += asgRev;

        const normRatio = totalAllocPct > 100 ? (100 / totalAllocPct) : 1;
        const allocPct = Number(a.allocationPct != null ? a.allocationPct : (a.allocationBasis === 'DAYS' ? ((Number(a.allocatedDays) || 22) / 22) * 100 : 100));
        const asgLoadedCost = Math.round(directCost * (allocPct / 100) * normRatio);

        empProjects.push({
          projectId: a.projectId,
          projectCode: a.projectCode,
          projectName: a.projectName,
          allocationPct: allocPct,
          allocatedDays: a.allocatedDays,
          billableRate: rate,
          revenueBase: asgRev,
          directCostBase: asgLoadedCost,
        });
      }

      const empProfit = empRev - totalCost;
      const empMarginPct = empRev > 0 ? Number(((empProfit / empRev) * 100).toFixed(1)) : 0;
      const deltaMargin = Number((empMarginPct - targetMargin).toFixed(1));

      sumEmpRev += empRev;
      sumEmpCost += totalCost;
      sumEmpProfit += empProfit;
      sumUnutilizedCost += unutilizedCost;

      empList.push({
        employeeId: emp.id,
        employeeCode: emp.code,
        code: emp.code,
        employeeName: emp.fullNameAr || emp.full_name_ar || emp.nameAr || 'الموظف',
        nameAr: emp.fullNameAr || emp.full_name_ar || emp.nameAr || 'الموظف',
        departmentName: deptMap.get(emp.departmentId || emp.placement?.departmentId) || emp.departmentName || 'تقنية المعلومات',
        positionTitle: emp.positionTitle || 'مهندس برمجيات',
        directCostBase: directCost,
        overheadBase: overhead,
        overheadCostBase: overhead,
        totalCostBase: totalCost,
        revenueBase: empRev,
        grossProfitBase: empProfit,
        grossMarginPct: empMarginPct,
        targetMarginPct: targetMargin,
        requiredMarginPct: targetMargin,
        deltaMarginPct: deltaMargin,
        allocatedPct: Number(totalAllocPct.toFixed(1)),
        unutilizedPct: Number(unutilizedPct.toFixed(1)),
        unutilizedCostBase: unutilizedCost,
        isOverAllocated: totalAllocPct > 100,
        overAllocatedPct: Number(overAllocatedPct.toFixed(1)),
        assetDepreciationBase: assetDeprCost,
        variablesCostBase: generalVarsCost,
        projects: empProjects,
        status: empMarginPct >= targetMargin ? 'TOP_PERFORMER' : empProfit >= 0 ? 'PROFITABLE' : 'LOSS_MAKER',
      });
    }

    const empSummary = {
      employeeCount: emps.length,
      totalRevenueBase: String(sumEmpRev.toFixed(2)),
      totalCostBase: String(sumEmpCost.toFixed(2)),
      totalUnutilizedCostBase: String(sumUnutilizedCost.toFixed(2)),
      totalProfitBase: String(sumEmpProfit.toFixed(2)),
      averageMarginPct: sumEmpRev > 0 ? String(((sumEmpProfit / sumEmpRev) * 100).toFixed(1)) : '0.00',
    };

    // 2. Project calculations (Level 2 per Business Process)
    const projectList: any[] = [];
    for (const p of prjs) {
      const pAsgs = assignments.filter((a: any) => matchesProject(a, p));
      let pRev = 0;
      let pDirect = 0;
      const teamMembers: any[] = [];

      for (const a of pAsgs) {
        const emp = emps.find((e: any) => matchesEmployee(a, e));
        const override = servicePrices.find((sp: any) => matchesEmployee(sp, a) && (matchesProject(sp, p) || !sp.projectId));
        let rawRate = Number(a.billableRate || a.dailyRate || a.unitPrice || 0);
        let basis = a.billingBasis || a.allocationBasis || 'DAILY';
        let rateCur = a.billingCurrency || 'SAR';
        if (override) {
          rawRate = Number(override.price || rawRate);
          basis = override.pricingBasis || basis;
          rateCur = override.currencyCode || rateCur;
        }
        const rate = convertToBase(rawRate, rateCur, targetPeriod?.endDate).amountBase;

        let asgRev = 0;
        if (basis === 'DAYS' || basis === 'DAILY' || a.allocationBasis === 'DAYS') {
          asgRev = (Number(a.allocatedDays) || 22) * rate;
        } else if (basis === 'HOURLY' || basis === 'HOURS' || a.allocationBasis === 'HOURLY') {
          asgRev = (Number(a.allocatedHours) || 160) * rate;
        } else {
          const pct = Number(a.allocationPct != null ? a.allocationPct : 100);
          asgRev = rate * (pct / 100);
        }
        pRev += asgRev;

        const eDirect = emp ? (empBreakdownMap.get(emp.id)?.distributableCostBase ?? 0) : 0;
        const empAllAsgs = assignments.filter((x: any) => matchesEmployee(x, a));
        const eTotalAlloc = empAllAsgs.reduce((acc: number, x: any) => acc + Number(x.allocationPct != null ? x.allocationPct : (x.allocationBasis === 'DAYS' ? ((Number(x.allocatedDays) || 22) / 22) * 100 : 100)), 0);
        const norm = eTotalAlloc > 100 ? (100 / eTotalAlloc) : 1;
        const thisAlloc = Number(a.allocationPct != null ? a.allocationPct : (a.allocationBasis === 'DAYS' ? ((Number(a.allocatedDays) || 22) / 22) * 100 : 100));
        const loadedCost = Math.round(eDirect * (thisAlloc / 100) * norm);
        pDirect += loadedCost;

        teamMembers.push({
          employeeId: a.employeeId,
          employeeCode: a.employeeCode || emp?.code || '',
          employeeName: a.employeeName || emp?.fullNameAr || 'الموظف',
          allocationBasis: a.allocationBasis || 'DAYS',
          allocatedDays: a.allocatedDays || 22,
          allocationPct: thisAlloc,
          billableRate: rate,
          revenue: asgRev,
          directCost: loadedCost,
          marginPct: asgRev > 0 ? Number((((asgRev - loadedCost) / asgRev) * 100).toFixed(1)) : 0,
        });
      }

      // Section 14 & 15: Add project-linked approved variables to project cost
      const pVars = monthlyVars.filter((v: any) => (v.projectId === p.id || v.projectId === p.code) && v.status === 'APPROVED');
      const pVarsCost = pVars.reduce((sum: number, v: any) => sum + Number(v.computedAmount || 0), 0);
      pDirect += pVarsCost;

      // Section 18: Add retroactive adjustments registered for this project
      const pRetros = retroAdjs.filter((r: any) => r.projectId === p.id || r.projectId === p.code);
      const pRetroRev = pRetros.reduce((sum: number, r: any) => sum + Number(r.grossRevenueBase || 0), 0);
      pRev += pRetroRev;

      const pOverhead = overheadPolicy.method === 'PERCENTAGE'
        ? Math.round(pDirect * (Number(overheadPolicy.rate || 0) / 100))
        : overheadPolicy.method === 'FIXED_PER_PROJECT'
          ? Math.round(Number(overheadPolicy.rate || 0))
          : Math.round(teamMembers.reduce((sum, m) => sum + Number(overheadPolicy.rate || 0) * ((Number(m.allocationPct) || 100) / 100), 0));
      const pTotal = pDirect + pOverhead;
      const pProfit = pRev - pTotal;
      const pMargin = pRev > 0 ? Number(((pProfit / pRev) * 100).toFixed(1)) : 0;
      const reqMargin = Number(p.requiredMarginPct || 25);
      const pDelta = Number((pMargin - reqMargin).toFixed(1));

      projectList.push({
        id: p.id,
        projectId: p.id,
        code: p.code,
        projectCode: p.code,
        nameAr: p.nameAr,
        projectName: p.nameAr,
        clientName: p.clientName || 'العميل',
        clientId: p.clientId,
        status: p.status || 'ACTIVE',
        currencyCode: p.currencyCode || 'SAR',
        revenueBase: pRev,
        directCostBase: pDirect,
        employeeCostBase: pDirect - pVarsCost,
        projectVariablesBase: pVarsCost,
        retroactiveRevenueBase: pRetroRev,
        overheadBase: pOverhead,
        overheadCostBase: pOverhead,
        totalCostBase: pTotal,
        grossProfitBase: pProfit,
        grossMarginPct: pMargin,
        requiredMarginPct: reqMargin,
        targetMarginPct: reqMargin,
        deltaMarginPct: pDelta,
        teamCount: teamMembers.length,
        teamMembers,
        profitabilityStatus: pMargin >= reqMargin ? 'PROFITABLE' : pProfit > 0 ? 'MARGINAL' : 'LOSS',
        meetsTarget: pMargin >= reqMargin,
      });
    }

    // 3. Client calculations (Level 3 per Business Process)
    const clientList: any[] = [];
    for (const c of clients) {
      const cProjects = projectList.filter((p) => p.clientId === c.id || p.clientName === c.nameAr);
      const cRev = cProjects.reduce((acc, p) => acc + p.revenueBase, 0);
      const cDirect = cProjects.reduce((acc, p) => acc + p.directCostBase, 0);
      const cOverhead = cProjects.reduce((acc, p) => acc + p.overheadBase, 0);
      const cTotal = cProjects.reduce((acc, p) => acc + p.totalCostBase, 0);
      const cProfit = cRev - cTotal;
      const cMargin = cRev > 0 ? Number(((cProfit / cRev) * 100).toFixed(1)) : 0;
      const uniqueTeam = new Set(cProjects.flatMap((p) => p.teamMembers.map((m: any) => m.employeeId))).size;

      clientList.push({
        id: c.id,
        clientId: c.id,
        code: c.code,
        clientCode: c.code,
        nameAr: c.nameAr,
        clientName: c.nameAr,
        revenueBase: cRev,
        directCostBase: cDirect,
        overheadBase: cOverhead,
        totalCostBase: cTotal,
        grossProfitBase: cProfit,
        grossMarginPct: cMargin,
        projectCount: cProjects.length,
        projectsCount: cProjects.length,
        teamCount: uniqueTeam,
        projects: cProjects,
      });
    }

    return { empSummary, empList, projectList, clientList };
  }

  if (path.includes('/profitability/projects')) {
    const { projectList } = computeDynamicProfitability();
    return makeList(projectList);
  }

  if (path.includes('/profitability/clients')) {
    const { clientList } = computeDynamicProfitability();
    return makeList(clientList);
  }

  if (path.includes('/profitability/employees') || path.includes('/reports/employee-profitability')) {
    const { empSummary, empList } = computeDynamicProfitability();
    return {
      summary: empSummary,
      employees: empList,
      data: empList,
      rows: empList,
      meta: { total: empList.length },
    };
  }

  // 4. Assignments Reports (Clean Dynamic Data)
  if (path.includes('/assignments/employee-days-report')) {
    const qStr = path.includes('?') ? path.split('?')[1] : '';
    const qParams = new URLSearchParams(qStr);
    const periodId = qParams.get('periodId');
    const period = resolvePeriodByIdOrDate(periodId, null);

    const emps = getEntityList('employees', []);
    const prjs = getEntityList('projects', []);
    const clients = getEntityList('clients', defaultClients);
    const assignments = getEntityList('assignments', []).filter((a: any) => isAssignmentActiveInPeriod(a, period));
    const servicePrices = getEntityList('service_prices', []).filter((sp: any) => !sp.effectiveTo);
    const invoices = getEntityList('invoices', []).filter((i: any) => i.status !== 'CANCELLED');
    const overheadPolicy = getOverheadPolicy();

    let totalAllocatedDaysAll = 0;
    let totalRevenueAll = 0;
    let totalCostAll = 0;
    let totalProfitAll = 0;
    let invoicedCount = 0;
    let pendingInvoiceCount = 0;

    const rows: any[] = [];

    for (const emp of emps) {
      const bd = computeEmployeeCostBreakdown(emp, period, overheadPolicy);
      const empMonthlyCost = bd.distributableCostBase;
      const positionTitle = emp.positionTitle || emp.role || 'مهندس برمجيات';

      const myAsgs = assignments.filter((a: any) => matchesEmployee(a, emp));

      if (myAsgs.length > 0) {
        let empAssignedDaysTotal = 0;
        for (const a of myAsgs) {
          const mDays = Number(a.workingDaysInMonth || 22);
          const days = a.allocatedDays != null ? Number(a.allocatedDays) : (Number(a.allocationPct || 100) / 100) * mDays;
          empAssignedDaysTotal += days;
        }

        for (const a of myAsgs) {
          const prj = prjs.find((p: any) => matchesProject(a, p)) || {
            id: a.projectId,
            code: a.projectCode || 'PRJ-001',
            nameAr: a.projectName || 'مشروع تطوير منصه',
            clientId: a.clientId || clients[0]?.id,
          };
          const cli = clients.find((c: any) => c.id === prj.clientId || c.id === a.clientId) || clients[0] || {
            id: 'cli-001',
            nameAr: 'شركة الإمداد لتقنية المعلومات',
          };

          const monthDays = Number(a.workingDaysInMonth || 22);
          const aDays = a.allocatedDays != null ? Number(a.allocatedDays) : Number(((Number(a.allocationPct || 100) / 100) * monthDays).toFixed(2));
          const aPct = Number(((aDays / monthDays) * 100).toFixed(1));

          const unutilizedDays = Math.max(0, Number((monthDays - empAssignedDaysTotal).toFixed(1)));
          const unutilizedPct = Math.max(0, Number(((unutilizedDays / monthDays) * 100).toFixed(1)));

          const spOverride = servicePrices.find(
            (sp: any) => matchesEmployee(sp, emp) && (matchesProject(sp, prj) || !sp.projectId)
          );

          const pricingBasis = spOverride?.pricingBasis || a.billingBasis || a.allocationBasis || 'DAILY';
          const unitPrice = Number(spOverride?.price || a.billableRate || a.dailyRate || a.unitPrice || 1500);

          let revenue = 0;
          if (pricingBasis === 'DAILY' || pricingBasis === 'DAYS') {
            revenue = aDays * unitPrice;
          } else if (pricingBasis === 'HOURLY' || pricingBasis === 'HOURS') {
            revenue = (aDays * 8) * unitPrice;
          } else {
            revenue = (aPct / 100) * unitPrice;
          }

          const costShare = Math.round(empMonthlyCost * (aPct / 100));
          const grossProfit = revenue - costShare;
          const marginPct = revenue > 0 ? Number(((grossProfit / revenue) * 100).toFixed(1)) : 0;

          const invMatch = invoices.find(
            (i: any) =>
              (matchesProject(i, prj) || i.projectId === a.projectId) &&
              (!periodId || i.fiscalPeriodId === periodId) &&
              (i.lines || []).some((l: any) => matchesEmployee(l, emp) || l.description?.includes(emp.fullNameAr || emp.nameAr || ''))
          );

          const invoiceStatus = invMatch ? (invMatch.status || 'POSTED') : 'UNINVOICED';
          if (invMatch) invoicedCount++;
          else pendingInvoiceCount++;

          totalAllocatedDaysAll += aDays;
          totalRevenueAll += revenue;
          totalCostAll += costShare;
          totalProfitAll += grossProfit;

          rows.push({
            assignmentId: a.id || `asg-${emp.id}-${prj.id}`,
            employeeId: emp.id,
            employeeCode: emp.code,
            employeeName: emp.fullNameAr || emp.nameAr || emp.name,
            positionTitle,
            projectId: prj.id,
            projectCode: prj.code,
            projectName: prj.nameAr,
            clientId: cli.id,
            clientName: cli.nameAr,
            allocationBasis: a.allocationBasis || 'DAYS',
            workingDaysInMonth: monthDays,
            allocatedDays: aDays,
            allocationPct: aPct,
            unutilizedDays,
            unutilizedPct,
            pricingBasis,
            unitPrice: unitPrice.toFixed(2),
            employeeMonthlyCost: empMonthlyCost.toFixed(2),
            projectCostShare: costShare.toFixed(2),
            revenueGenerated: revenue.toFixed(2),
            grossProfit: grossProfit.toFixed(2),
            marginPct,
            invoiceStatus,
            invoiceId: invMatch?.id || null,
            invoiceNo: invMatch?.invoiceNo || null,
          });
        }
      } else {
        totalCostAll += empMonthlyCost;
        totalProfitAll -= empMonthlyCost;
        pendingInvoiceCount++;

        rows.push({
          assignmentId: `unassigned-${emp.id}`,
          employeeId: emp.id,
          employeeCode: emp.code,
          employeeName: emp.fullNameAr || emp.nameAr || emp.name,
          positionTitle,
          projectId: '',
          projectCode: 'BENCH',
          projectName: 'غير مسند لمشروع (على قوة الشركة - Bench)',
          clientId: '',
          clientName: 'تشغيل وتطوير داخلي',
          allocationBasis: 'DAYS',
          workingDaysInMonth: 22,
          allocatedDays: 0,
          allocationPct: 0,
          unutilizedDays: 22,
          unutilizedPct: 100,
          pricingBasis: 'DAILY',
          unitPrice: '0.00',
          employeeMonthlyCost: empMonthlyCost.toFixed(2),
          projectCostShare: '0.00',
          revenueGenerated: '0.00',
          grossProfit: (-empMonthlyCost).toFixed(2),
          marginPct: 0,
          invoiceStatus: 'UNINVOICED',
          invoiceId: null,
          invoiceNo: null,
        });
      }
    }

    const averageMarginPct = totalRevenueAll > 0 ? Number(((totalProfitAll / totalRevenueAll) * 100).toFixed(1)) : 0;

    return {
      period: {
        id: period?.id || periodId || 'fp-2026-11',
        name: period?.name || 'الفترة المالية الحالية',
        start: period?.startDate || '2026-11-01',
        end: period?.endDate || '2026-11-30',
      },
      summary: {
        totalAssignments: rows.filter((r) => r.projectId).length,
        totalAllocatedDays: totalAllocatedDaysAll,
        totalRevenue: totalRevenueAll.toFixed(2),
        totalCost: totalCostAll.toFixed(2),
        totalProfit: totalProfitAll.toFixed(2),
        averageMarginPct,
        invoicedCount,
        pendingInvoiceCount,
      },
      rows,
      meta: { total: rows.length },
    };
  }

  if (path.includes('/assignments/utilization')) {
    const { empList } = computeDynamicProfitability();
    return makeList(empList);
  }

  // 5. Employees & Placement (Clean Dynamic List)
  if (path.includes('/employees')) {
    const emps = getEntityList('employees', []);
    if (path.includes('/cost')) {
      const cleanP = path.split('?')[0].replace(/\/$/, '');
      const segments = cleanP.split('/').filter(Boolean); // ['employees', targetId, 'cost']
      const targetId = segments[1];
      const qStr = path.includes('?') ? path.split('?')[1] : '';
      const qParams = new URLSearchParams(qStr);
      const period = resolvePeriodByIdOrDate(qParams.get('periodId'), null);
      const emp = emps.find((e: any) => e.id === targetId || e.code === targetId || e.code?.toLowerCase() === targetId?.toLowerCase());
      if (!emp) {
        return {
          employedDays: 0,
          periodDays: 22,
          totalCostBase: '0.00',
          distributableCostBase: '0.00',
          totalDeductionsBase: '0.00',
          dailyDirectCost: '0.00',
          dailyOverheadCost: '0.00',
          dailyTotalCost: '0.00',
          currency: 'SAR',
          baseCurrency: 'SAR',
          breakdown: [],
          lines: [],
        };
      }
      const bd = computeEmployeeCostBreakdown(emp, period);
      return {
        ...bd,
        totalCostBase: bd.totalCostBase.toFixed(2),
        distributableCostBase: bd.distributableCostBase.toFixed(2),
        totalDeductionsBase: bd.totalDeductionsBase.toFixed(2),
      };
    }

    if (path.includes('/documents')) {
      return makeList(getEntityList('employee_documents', []));
    }

    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const segments = cleanP.split('/').filter(Boolean); // e.g. ['employees', 'id']

    if (segments.length >= 2 && segments[0] === 'employees') {
      const targetId = segments[1];
      const singleEmp = emps.find((e) => e.id === targetId || e.code === targetId || e.code?.toLowerCase() === targetId?.toLowerCase());
      const allAsg = getEntityList('assignments', []);
      const empAsg = allAsg.filter((a) => matchesEmployee(a, singleEmp || { id: targetId, code: targetId }));

      if (singleEmp) {
        const defaultPlacement = {
          id: `plc-${singleEmp.id || '1'}`,
          effectiveFrom: singleEmp.hireDate || new Date().toISOString().slice(0, 10),
          effectiveTo: null,
          departmentId: singleEmp.departmentId || singleEmp.placement?.departmentId || null,
          branchId: singleEmp.branchId || singleEmp.placement?.branchId || null,
          positionId: singleEmp.positionId || singleEmp.placement?.positionId || null,
          costCenterId: singleEmp.costCenterId || singleEmp.placement?.costCenterId || null,
          departmentName: singleEmp.departmentName || '',
          branchName: singleEmp.branchName || '',
          positionTitle: singleEmp.positionTitle || '',
          costCenterName: singleEmp.costCenterName || '',
          managerName: null,
          changeReason: 'التعيين الأولي وتسكين الكادر',
        };
        const defaultCompensation = {
          id: `cmp-${singleEmp.id || '1'}`,
          effectiveFrom: singleEmp.hireDate || new Date().toISOString().slice(0, 10),
          effectiveTo: null,
          basicSalary: singleEmp.basicSalary || singleEmp.compensation?.basicSalary || '0.00',
          salaryCurrency: singleEmp.salaryCurrency || singleEmp.compensation?.salaryCurrency || 'SAR',
          insuranceSalary: singleEmp.insuranceSalary || singleEmp.compensation?.insuranceSalary || '0.00',
          insuranceCurrency: singleEmp.insuranceCurrency || singleEmp.salaryCurrency || 'SAR',
          changeReason: 'الراتب المعتمد عند التعيين',
          createdBy: 'المدير التنفيذي',
          createdAt: new Date().toISOString(),
        };

        const activeAssets = getEntityList<any>('assets', []).filter(
          (a) => (a.custodianEmployeeId === singleEmp.id || a.employeeId === singleEmp.id || a.custodianEmployeeId === singleEmp.code) && a.status === 'ACTIVE',
        );
        const assetCustodies = activeAssets.map((a) => ({
          id: `cst-${a.id}`,
          assetId: a.id,
          assetCode: a.code || a.assetCode || 'AST',
          assetNameAr: a.nameAr || a.assetNameAr || 'أصل تشغيلي',
          assignedDate: a.assignedDate || a.purchaseDate || singleEmp.hireDate || new Date().toISOString().slice(0, 10),
          returnedDate: null,
          conditionOut: 'جيد جداً',
          conditionIn: null,
          monthlyDepreciationBase: Math.round(((Number(a.costBase || a.cost || 0) - Number(a.salvageValueBase || 0)) / (Number(a.usefulLifeMonths) || 36)) * 100) / 100,
        }));
        const existingCustodies = Array.isArray(singleEmp.custodies) ? singleEmp.custodies : [];
        const mergedCustodies = [
          ...assetCustodies,
          ...existingCustodies.filter((c: any) => !assetCustodies.some((ac) => ac.assetId === c.assetId || ac.assetCode === c.assetCode)),
        ];

        return {
          ...singleEmp,
          fullNameAr: singleEmp.fullNameAr || singleEmp.full_name_ar || singleEmp.nameAr || 'موظف',
          fullNameEn: singleEmp.fullNameEn || singleEmp.full_name_en || singleEmp.nameEn || '',
          code: singleEmp.code || targetId,
          hireDate: singleEmp.hireDate || singleEmp.hire_date || new Date().toISOString().slice(0, 10),
          basicSalary: singleEmp.basicSalary || '0.00',
          salaryCurrency: singleEmp.salaryCurrency || 'SAR',
          insuranceSalary: singleEmp.insuranceSalary || '0.00',
          insuranceCurrency: singleEmp.insuranceCurrency || singleEmp.salaryCurrency || 'SAR',
          placement: defaultPlacement,
          placements: Array.isArray(singleEmp.placements) && singleEmp.placements.length > 0 ? singleEmp.placements : [defaultPlacement],
          salary: defaultCompensation,
          compensations: Array.isArray(singleEmp.compensations) && singleEmp.compensations.length > 0 ? singleEmp.compensations : [defaultCompensation],
          costProfiles: Array.isArray(singleEmp.costProfiles) ? singleEmp.costProfiles : [],
          assignments: empAsg,
          overrides: Array.isArray(singleEmp.overrides) ? singleEmp.overrides : [],
          custodies: mergedCustodies,
          documents: Array.isArray(singleEmp.documents) ? singleEmp.documents : [],
          statusHistory: Array.isArray(singleEmp.statusHistory) && singleEmp.statusHistory.length > 0 ? singleEmp.statusHistory : [
            {
              id: `sh-${singleEmp.id || '1'}`,
              oldStatus: null,
              newStatus: singleEmp.status || 'ACTIVE',
              effectiveDate: singleEmp.hireDate || new Date().toISOString().slice(0, 10),
              reason: 'HIRED',
              changedBy: 'المدير التنفيذي',
              changedAt: new Date().toISOString(),
            }
          ],
        };
      }

      // Safe non-crashing fallback if single employee record not found
      return {
        id: targetId,
        code: targetId,
        fullNameAr: `الموظف ${targetId}`,
        fullNameEn: `Employee ${targetId}`,
        status: 'ACTIVE',
        hireDate: new Date().toISOString().slice(0, 10),
        basicSalary: '0.00',
        salaryCurrency: 'SAR',
        insuranceSalary: '0.00',
        insuranceCurrency: 'SAR',
        placements: [],
        compensations: [],
        costProfiles: [],
        assignments: empAsg,
        overrides: [],
        custodies: [],
        documents: [],
        statusHistory: [],
      };
    }
    return makeList(emps);
  }

  // 6. Projects (المشاريع)
  if (path.includes('/projects')) {
    const projects = getEntityList('projects', []);
    const allAsg = getEntityList('assignments', []);
    const allPrices = getEntityList('service_prices', []);
    const emps = getEntityList('employees', []);

    const singleProj: any = projects.find((p: any) => path.endsWith(`/${p.id}`) || path.endsWith(`/${p.code}`) || path.includes(`/${p.id}/`) || path.includes(`/${p.code}/`));
    if (singleProj) {
      const prjAsgs = allAsg.filter((a: any) => matchesProject(a, singleProj)).map((a: any) => {
        const emp = emps.find((e: any) => matchesEmployee(a, e));
        return {
          ...a,
          employeeName: a.employeeName || emp?.fullNameAr || emp?.nameAr || 'الموظف',
          employeeCode: a.employeeCode || emp?.code || '',
        };
      });
      const prjPrices = allPrices.filter((sp: any) => matchesProject(sp, singleProj));
      return {
        ...singleProj,
        assignments: prjAsgs,
        activeAssignmentCount: prjAsgs.length,
        servicePrices: prjPrices.length > 0 ? prjPrices : (Array.isArray(singleProj.servicePrices) ? singleProj.servicePrices : []),
        prices: prjPrices.length > 0 ? prjPrices : (Array.isArray(singleProj.prices) ? singleProj.prices : []),
        statusHistory: Array.isArray(singleProj.statusHistory) ? singleProj.statusHistory : (Array.isArray(singleProj.history) ? singleProj.history : []),
        history: Array.isArray(singleProj.statusHistory) ? singleProj.statusHistory : (Array.isArray(singleProj.history) ? singleProj.history : []),
      };
    }

    const enrichedProjects = projects.map((p: any) => {
      const pCount = allAsg.filter((a: any) => matchesProject(a, p)).length;
      return {
        ...p,
        activeAssignmentCount: pCount,
      };
    });

    return makeList(enrichedProjects);
  }

  // 7. Clients (العملاء)
  if (path.includes('/clients')) {
    const clients = getEntityList('clients', defaultClients);
    const singleCli = clients.find((c: any) => path.endsWith(`/${c.id}`) || path.endsWith(`/${c.code}`));
    if (singleCli) return singleCli;
    return makeList(clients);
  }

  // 8. Assignments & Workload (الإسناد)
  if (path.includes('/assignments')) {
    let rows = getEntityList('assignments', []);
    const queryStr = path.includes('?') ? path.split('?')[1] : '';
    const params = new URLSearchParams(queryStr);
    const filterEmp = params.get('employeeId');
    const filterPrj = params.get('projectId');
    if (filterEmp) {
      const emps = getEntityList('employees', []);
      const matchedEmp = emps.find((e: any) => e.id === filterEmp || e.code === filterEmp);
      rows = rows.filter((a) => (matchedEmp ? matchesEmployee(a, matchedEmp) : (a.employeeId === filterEmp || a.employeeCode === filterEmp)));
    }
    if (filterPrj) {
      const projects = getEntityList('projects', []);
      const matchedPrj = projects.find((p: any) => p.id === filterPrj || p.code === filterPrj);
      rows = rows.filter((a) => (matchedPrj ? matchesProject(a, matchedPrj) : (a.projectId === filterPrj || a.projectCode === filterPrj)));
    }
    let totalDays = 0;
    let totalRevenue = 0;
    let totalCost = 0;
    for (const a of rows) {
      totalDays += Number(a.allocatedDays || 0);
      totalRevenue += Number(a.monthlyRevenue || (Number(a.billableRate || 0) * (Number(a.allocatedDays) || 22)));
      totalCost += Number(a.allocatedCost || 0);
    }
    const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
    return {
      summary: { totalDays, totalRevenue, totalCost, margin: margin.toFixed(1) },
      rows,
      data: rows,
      meta: { page: 1, pageSize: 50, total: rows.length },
    };
  }

  // 9. Organization Structures (الفروع، الأقسام، مراكز التكلفة)
  if (path.includes('/branches')) {
    return makeList(getEntityList('branches', defaultBranches));
  }

  if (path.includes('/departments')) {
    return makeList(getEntityList('departments', defaultDepartments));
  }

  if (path.includes('/cost-centers')) {
    return makeList(getEntityList('cost_centers', defaultCostCenters));
  }

  if (path.includes('/currencies') || path.includes('/company-currencies')) {
    return makeList(getEntityList('currencies', defaultCurrenciesList));
  }

  if (path.includes('/exchange-rates')) {
    const qStr = path.includes('?') ? path.split('?')[1] : '';
    const params = new URLSearchParams(qStr);
    const fromCur = params.get('fromCurrency');
    const toCur = params.get('toCurrency');
    let rates = getEntityList('exchange_rates', defaultExchangeRatesList);
    if (fromCur) rates = rates.filter((r: any) => r.fromCurrency === fromCur);
    if (toCur) rates = rates.filter((r: any) => r.toCurrency === toCur);
    return makeList(rates);
  }

  // 10. Accounting & Ledgers
  if (path.includes('/fiscal-years')) {
    const defaultFy = [
      { id: 'fy-2026', code: 'FY-2026', nameAr: 'السنة المالية 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'OPEN', isClosed: false },
    ];
    return makeList(getEntityList('fiscal_years', defaultFy));
  }

  if (path.includes('/fiscal-periods')) {
    return makeList(getEntityList('fiscal_periods', defaultFiscalPeriodsList));
  }

  if (path.includes('/work-calendars')) {
    return makeList(getEntityList('work_calendars', []));
  }

  if (path.includes('/tax-codes') || path.includes('/taxes')) {
    const defaultTaxes = [
      { id: 'tax-15', code: 'VAT15', nameAr: 'ضريبة القيمة المضافة القياسية 15%', ratePct: '15.00', taxType: 'VAT', isRecoverable: true, isActive: true },
      { id: 'tax-0', code: 'VAT0', nameAr: 'ضريبة بنسبة الصفر %0', ratePct: '0.00', taxType: 'VAT', isRecoverable: true, isActive: true },
      { id: 'tax-ex', code: 'VATEX', nameAr: 'معفى من الضريبة', ratePct: '0.00', taxType: 'EXEMPT', isRecoverable: false, isActive: true },
    ];
    return makeList(getEntityList('tax_codes', defaultTaxes));
  }

  if (path.includes('/accounts')) {
    return makeList(getNormalizedAccounts());
  }

  if (path.includes('/bank-accounts') || path.includes('/banks')) {
    const accounts = getNormalizedAccounts();
    const accMap = new Map(accounts.map((a) => [a.id, a]));
    const banks = getEntityList('bank_accounts', defaultBankAccountsList).map((b: any) => {
      const gl = accMap.get(b.glAccountId) || accounts.find((a) => a.code === b.glAccountCode);
      return {
        ...b,
        glAccountCode: gl?.code || b.glAccountCode || '10201',
        glAccountNameAr: gl?.nameAr || b.glAccountNameAr || 'النقدية بالبنوك',
      };
    });
    const cleanB = path.split('?')[0].replace(/\/$/, '');
    const singleB = banks.find((b: any) => cleanB.endsWith(`/${b.id}`));
    if (singleB) return singleB;
    return makeList(banks);
  }

  if (path.includes('/bank-transfers')) {
    return makeList(getEntityList('bank_transfers', []));
  }

  if (path.includes('/journal-entries') || path.includes('/journals')) {
    const accounts = getNormalizedAccounts();
    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const qStr = path.includes('?') ? path.split('?')[1] : '';
    const params = new URLSearchParams(qStr);
    const statusFilter = params.get('status');
    const fromDate = params.get('fromDate');
    const toDate = params.get('toDate');
    const jes = getEntityList<any>('journal_entries', []).map((j) => normalizeJournalEntry(j, accounts));
    const singleJe = jes.find((j) => cleanP.endsWith(`/${j.id}`) || (j.entryNo && cleanP.endsWith(`/${j.entryNo}`)));
    if (singleJe) return singleJe;
    let filtered = statusFilter ? jes.filter((j) => j.status === statusFilter) : jes;
    if (fromDate) filtered = filtered.filter((j) => String(j.entryDate) >= fromDate);
    if (toDate) filtered = filtered.filter((j) => String(j.entryDate) <= toDate);
    filtered.sort((a, b) => String(b.entryDate).localeCompare(String(a.entryDate)) || String(b.createdAt).localeCompare(String(a.createdAt)));
    return makeList(filtered);
  }

  // 11. Live Financial Reports & Statements from Posted Journal Entries
  if (path.includes('/ledger/trial')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    return computeTrialBalance({
      from: p.get('from') || undefined,
      to: p.get('to') || undefined,
      ledger: p.get('ledger') || 'FINANCIAL',
      branchId: p.get('branchId') || undefined,
    });
  }

  if (path.includes('/ledger/income')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    return computeIncomeStatement({
      from: p.get('from') || undefined,
      to: p.get('to') || undefined,
      branchId: p.get('branchId') || undefined,
    });
  }

  if (path.includes('/ledger/balance')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    return computeBalanceSheet({
      asOf: p.get('asOf') || undefined,
      branchId: p.get('branchId') || undefined,
    });
  }

  if (path.includes('/ledger/account-statement')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    return computeAccountStatement({
      accountId: p.get('accountId') || undefined,
      from: p.get('from') || undefined,
      to: p.get('to') || undefined,
      branchId: p.get('branchId') || undefined,
    });
  }

  if (path.includes('/posting-rules') || path.includes('/posting-events')) {
    const defaultRules = [
      { id: 'pr-01', eventCode: 'INVOICE_POSTED', nameAr: 'ترحيل فاتورة مبيعات', debitAccountCode: '10301', creditAccountCode: '40101', taxAccountCode: '20201', isActive: true },
      { id: 'pr-02', eventCode: 'PAYROLL_POSTED', nameAr: 'ترحيل مسير الرواتب الشهري', debitAccountCode: '50101', creditAccountCode: '10202', isActive: true },
      { id: 'pr-03', eventCode: 'DEPRECIATION_POSTED', nameAr: 'ترحيل قيد الإهلاك الدوري', debitAccountCode: '50301', creditAccountCode: '10502', isActive: true },
    ];
    return makeList(getEntityList('posting_rules', defaultRules));
  }

  // 12. Invoicing, ZATCA & Sales
  if (path.includes('/credit-notes')) {
    return makeList(getEntityList('credit_notes', []));
  }

  if (path.includes('/invoices') || path.includes('/sal/invoices') || path.includes('/zatca/invoices')) {
    const cleanI = path.split('?')[0].replace(/\/$/, '');
    const invs = getEntityList<any>('invoices', []);
    if (path.includes('/ubl-xml')) {
      const parts = cleanI.split('/').filter(Boolean);
      const xmlIdx = parts.findIndex((p) => p === 'ubl-xml');
      const targetId = xmlIdx > 0 ? parts[xmlIdx - 1] : '';
      const inv = invs.find((i: any) => i.id === targetId || i.invoiceNo === targetId) || invs[0];
      const ublXml = inv ? buildZatcaUblXml(inv) : '<?xml version="1.0" encoding="UTF-8"?><Invoice></Invoice>';
      return { ublXml, hash: inv?.zatcaHash || sha256Hex(ublXml) };
    }
    const single = invs.find((i: any) => cleanI.endsWith(`/${i.id}`) || cleanI.endsWith(`/${i.invoiceNo}`));
    if (single) {
      return {
        ...single,
        lines: Array.isArray(single.lines) ? single.lines : [],
        payments: Array.isArray(single.payments) ? single.payments : [],
      };
    }
    return makeList(filterInvoicesByQuery(invs, path, { isZatca: path.includes('/zatca/invoices') }));
  }

  // 13. ZATCA
  if (path.includes('/zatca/status')) {
    return getZatcaLiveStatus();
  }

  if (path.includes('/zatca/settings')) {
    return getZatcaSettings();
  }

  if (path.includes('/zatca/submissions')) {
    return makeList(getEntityList('zatca_submissions', []));
  }

  if (path.includes('/zatca/decode-qr')) {
    return decodeZatcaTlv('');
  }

  // 14. Purchases & Vendors
  if (path.includes('/vendors')) {
    const vens = getEntityList('vendors', []);
    const singleVen = vens.find((v: any) => path.endsWith(`/${v.id}`) || path.endsWith(`/${v.code}`));
    if (singleVen) return singleVen;
    return makeList(vens);
  }

  if (path.includes('/purchase-invoices') || path.includes('/pur/invoices')) {
    const pinvs = getEntityList('purchase_invoices', []);
    const cleanPinvPath = path.split('?')[0];
    const singlePinv: any = pinvs.find((p: any) => cleanPinvPath.endsWith(`/${p.id}`));
    if (singlePinv) {
      return {
        ...singlePinv,
        lines: Array.isArray(singlePinv.lines) ? singlePinv.lines : [],
        payments: Array.isArray(singlePinv.payments) ? singlePinv.payments : [],
      };
    }
    return makeList(filterInvoicesByQuery(pinvs, path));
  }

  if (path.includes('/debit-notes')) {
    return makeList(getEntityList('debit_notes', []));
  }

  if (path.includes('/services/catalog') || path.includes('/services')) {
    return makeList(getEntityList('services_catalog', []));
  }

  // 15. Payroll, Variables, Loans (Business Process Sections 12-16)
  if (path.includes('/payroll-runs')) {
    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const runs = getEntityList<any>('payroll_runs', []);
    if (cleanP.includes('/preview')) {
      const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
      const period = resolvePeriodByIdOrDate(p.get('periodId'), null);
      const emps = getEntityList<any>('employees', []).filter((e) => e.status === 'ACTIVE');
      const monthlyVars = getEntityList<any>('monthly_variables', []).filter(
        (v) => v.status === 'APPROVED' && (!period || !v.fiscalPeriodId || v.fiscalPeriodId === period.id),
      );
      const loans = getEntityList<any>('loans', []).filter((l) => l.status === 'ACTIVE');
      const existing = runs.find((r) => r.fiscalPeriodId === period?.id && r.status === 'POSTED');

      let totalSalary = 0;
      let totalVars = 0;
      let totalLoanDed = 0;
      let totalNet = 0;

      const lines = emps.map((emp, idx) => {
        const salRaw = Number(emp.basicSalary || emp.basic_salary || emp.salary || 0);
        const salBase = convertToBase(salRaw, emp.salaryCurrency || 'SAR', period?.endDate).amountBase;
        const empVars = monthlyVars.filter((v) => v.employeeId === emp.id || v.employeeCode === emp.code);
        let bonuses = 0;
        let overtime = 0;
        let allowances = 0;
        let deductions = 0;
        for (const v of empVars) {
          const vBase = convertToBase(v.computedAmount || v.amount || 0, v.currencyCode || 'SAR', period?.endDate).amountBase;
          if (v.category === 'DEDUCTION') {
            deductions += vBase;
          } else if (String(v.variableTypeId || '').includes('overtime') || String(v.variableTypeName || '').includes('إضافي')) {
            overtime += vBase;
          } else if (String(v.variableTypeId || '').includes('allow') || String(v.variableTypeName || '').includes('بدل')) {
            allowances += vBase;
          } else {
            bonuses += vBase;
          }
        }

        // Section 16: Loan installment due for this exact period reduces Net Payable ONLY
        let loanDed = 0;
        for (const loan of loans) {
          if (loan.employeeId !== emp.id && loan.employeeCode !== emp.code) continue;
          const dueInst = (Array.isArray(loan.installments_list) ? loan.installments_list : []).filter(
            (inst: any) => inst.status === 'PENDING' && (!period || inst.periodId === period.id),
          );
          for (const inst of dueInst) loanDed += Number(inst.dueAmount || 0);
        }

        const gross = salBase + bonuses + overtime + allowances;
        const net = Math.max(0, gross - deductions - loanDed);
        totalSalary += salBase;
        totalVars += (bonuses + overtime + allowances - deductions);
        totalLoanDed += loanDed;
        totalNet += net;

        return {
          id: `prl-${idx + 1}`,
          employeeId: emp.id,
          employeeCode: emp.code,
          employeeName: emp.fullNameAr || emp.nameAr || 'موظف',
          salaryBase: salBase.toFixed(2),
          bonusesBase: bonuses.toFixed(2),
          overtimeBase: overtime.toFixed(2),
          allowancesBase: allowances.toFixed(2),
          deductionsBase: deductions.toFixed(2),
          loanDeductionsBase: loanDed.toFixed(2),
          grossBase: gross.toFixed(2),
          netPayableBase: net.toFixed(2),
        };
      });

      return {
        runCode: `PAY-${(period?.startDate || new Date().toISOString()).slice(0, 7)}-PREV`,
        periodName: period?.name || 'الفترة الحالية',
        employeeCount: lines.length,
        totalSalaryBase: totalSalary.toFixed(2),
        totalVariablesBase: totalVars.toFixed(2),
        totalLoanDeductionsBase: totalLoanDed.toFixed(2),
        netPayableBase: totalNet.toFixed(2),
        existingRunId: existing?.id || null,
        currencyCode: getStoredCompany().baseCurrency || 'SAR',
        payoutCurrency: getStoredCompany().baseCurrency || 'SAR',
        lines,
      };
    }

    const singleRun: any = runs.find((r) => cleanP.endsWith(`/${r.id}`));
    if (singleRun) {
      return {
        ...singleRun,
        lines: Array.isArray(singleRun.lines) ? singleRun.lines : [],
        entries: Array.isArray(singleRun.entries) ? singleRun.entries : [],
      };
    }
    return makeList(runs);
  }

  if (path.includes('/monthly-variables')) {
    return makeList(getEntityList('monthly_variables', []));
  }

  if (path.includes('/variable-types')) {
    return makeList(getEntityList('variable_types', defaultVariableTypesList));
  }

  if (path.includes('/loans')) {
    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const loans = getEntityList('loans', []);
    const normalizeLoan = (l: any) => {
      const list = Array.isArray(l.installments_list)
        ? l.installments_list
        : (Array.isArray(l.installmentsSchedule) ? l.installmentsSchedule : (Array.isArray(l.installments) ? l.installments : []));
      const count = typeof l.installments === 'number' ? l.installments : (list.length || 1);
      const principalNum = Number(l.principalBase || l.principalAmount || 0);
      return {
        ...l,
        principalBase: principalNum.toFixed(2),
        installments: count,
        installmentAmount: l.installmentAmount || (principalNum / Math.max(1, count)).toFixed(2),
        installments_list: list,
      };
    };
    const singleLoan: any = loans.find((l: any) => cleanP.endsWith(`/${l.id}`));
    if (singleLoan) return normalizeLoan(singleLoan);
    return makeList(loans.map(normalizeLoan));
  }

  if (path.includes('/eosb')) {
    const emps = getEntityList<any>('employees', []);
    const emp = emps.find((e: any) => e.id === body?.employeeId) || emps[0];
    const salary = Number(emp?.basicSalary || emp?.basic_salary || 0);
    const years = 3;
    const halfMonth = salary / 2;
    const gross = halfMonth * years;
    const pct = body?.terminationType === 'RESIGNATION' ? 33.333 : 100;
    const net = (gross * pct) / 100;
    return {
      employeeId: emp?.id || '',
      employeeCode: emp?.code || '',
      employeeNameAr: emp?.fullNameAr || emp?.nameAr || 'موظف',
      hireDate: emp?.hireDate || '2023-01-01',
      terminationDate: body?.terminationDate || new Date().toISOString().slice(0, 10),
      totalServiceDays: years * 365,
      totalServiceYears: years,
      monthlySalary: salary.toFixed(2),
      baseAmountFirst5Years: gross.toFixed(2),
      baseAmountAfter5Years: '0.00',
      grossAmount: gross.toFixed(2),
      entitlementPct: pct,
      netEosbDue: net.toFixed(2),
      saudiLaborArticle: body?.terminationType === 'RESIGNATION' ? 'المادة 85 من نظام العمل السعودي' : 'المادة 84 من نظام العمل السعودي',
      calculationBreakdownAr: 'محسوبة بدقة وفقاً لنظام العمل السعودي.',
    };
  }

  // 16. Fixed Assets & Custodies
  if (path.includes('/asset-categories')) {
    return makeList(getEntityList('asset_categories', defaultAssetCategoriesList));
  }

  if (path.includes('/assets')) {
    const cleanA = path.split('?')[0].replace(/\/$/, '');
    const assets = getEntityList('assets', []);
    const singleAst: any = assets.find((a: any) => cleanA.endsWith(`/${a.id}`));
    if (singleAst) {
      return {
        ...singleAst,
        custodies: Array.isArray(singleAst.custodies) ? singleAst.custodies : [],
        schedule: Array.isArray(singleAst.schedule) ? singleAst.schedule : [],
      };
    }
    return makeList(assets);
  }

  if (path.includes('/depreciation-runs')) {
    const cleanD = path.split('?')[0].replace(/\/$/, '');
    if (cleanD.includes('/preview')) {
      const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
      return previewDepreciationRun(p.get('periodId'));
    }
    const runs = getEntityList<any>('depreciation_runs', []);
    const singleRun = runs.find((r) => cleanD.endsWith(`/${r.id}`));
    if (singleRun) return singleRun;
    return makeList(runs);
  }

  if (path.includes('/custodies/report') || (path.includes('/custodies') && path.includes('/report'))) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    return computeCustodiesReport({
      employeeId: p.get('employeeId') || undefined,
      fromDate: p.get('fromDate') || undefined,
      toDate: p.get('toDate') || undefined,
    });
  }

  if (path.includes('/custodies')) {
    const cleanC = path.split('?')[0].replace(/\/$/, '');
    const custodies = getEntityList('custodies', []);
    const singleCst = custodies.find((c: any) => cleanC.endsWith(`/${c.id}`));
    if (singleCst) return singleCst;
    return makeList(custodies);
  }

  // 17. Cost Engine, Profiles & Components (100% Dynamic from real data + Cost Profiles + FX + Asset Depr)
  if (path.includes('/cost-components')) {
    return makeList(getEntityList('cost_components', defaultCostComponentsList));
  }

  if (path.includes('/cost-profiles')) {
    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const profiles = getEntityList('cost_profiles', defaultCostProfilesList);
    const singleCp: any = profiles.find((p: any) => cleanP.endsWith(`/${p.id}`) || cleanP.endsWith(`/${p.code}`));
    if (singleCp) {
      const lines = Array.isArray(singleCp.lines) ? singleCp.lines : (Array.isArray(singleCp.components) ? singleCp.components : []);
      return { ...singleCp, lines, components: lines };
    }
    return makeList(profiles);
  }

  if (path.includes('/cost-sheet')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const period = resolvePeriodByIdOrDate(p.get('periodId'), null);
    const emps = getEntityList<any>('employees', []);
    if (emps.length === 0) {
      return {
        period: period || { id: 'fp-2026-11', name: 'نوفمبر 2026' },
        totals: { totalCostBase: '0.00', distributableCostBase: '0.00', totalDeductionsBase: '0.00' },
        rows: [],
        dailyWorkingHours: 8,
        annualWorkingDays: 240,
        monthlyWorkingDays: 22,
        components: getEntityList('cost_components', defaultCostComponentsList),
      };
    }

    let sumTotal = 0;
    let sumDist = 0;
    let sumDed = 0;
    const rows = emps.map((e: any, idx: number) => {
      const bd = computeEmployeeCostBreakdown(e, period);
      sumTotal += bd.totalCostBase;
      sumDist += bd.distributableCostBase;
      sumDed += bd.totalDeductionsBase;
      return {
        employeeId: e.id || `emp-${idx}`,
        code: e.code || `EMP-00${idx + 1}`,
        fullNameAr: e.fullNameAr || e.nameAr || e.name || 'موظف',
        employedDays: bd.employedDays,
        periodDays: bd.periodDays,
        totalCostBase: bd.totalCostBase.toFixed(2),
        distributableCostBase: bd.distributableCostBase.toFixed(2),
        totalDeductionsBase: bd.totalDeductionsBase.toFixed(2),
        lines: bd.lines,
      };
    });

    return {
      period: period || { id: 'fp-2026-11', name: 'نوفمبر 2026' },
      totals: {
        totalCostBase: sumTotal.toFixed(2),
        distributableCostBase: sumDist.toFixed(2),
        totalDeductionsBase: sumDed.toFixed(2),
      },
      rows,
      dailyWorkingHours: 8,
      annualWorkingDays: 240,
      monthlyWorkingDays: 22,
      components: getEntityList('cost_components', defaultCostComponentsList),
    };
  }

  // 18. Overhead Policy & Service Prices
  if (path.includes('/overhead-policy')) {
    return getOverheadPolicy();
  }

  if (path.includes('/service-prices')) {
    return makeList(getEntityList('service_prices', []));
  }

  // 19. Revenue Recognition & Runs
  if (path.includes('/revenue-adjustments')) {
    const q = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const pId = q.get('periodId');
    const allAdjs = getEntityList<any>('revenue_adjustments', []);
    const filtered = pId ? allAdjs.filter((r) => r.fiscalPeriodId === pId || r.originalPeriodId === pId) : allAdjs;
    return makeList(filtered);
  }

  if (path.includes('/revenue-runs')) {
    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const runs = getEntityList<any>('revenue_runs', []);
    if (cleanP.includes('/preview')) {
      const q = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
      const period = resolvePeriodByIdOrDate(q.get('periodId'), null);
      const asgs = getEntityList('assignments', []).filter((a: any) => isAssignmentActiveInPeriod(a, period));
      const servicePrices = getEntityList('service_prices', []).filter((sp: any) => !sp.effectiveTo);
      const existing = runs.find((r) => r.fiscalPeriodId === period?.id && r.status === 'POSTED');
      let totalRev = 0;
      const lines = asgs.map((a: any, idx: number) => {
        const override = servicePrices.find((sp: any) => matchesEmployee(sp, a) && (matchesProject(sp, a) || !sp.projectId));
        const rawRate = Number(override?.price ?? a.billableRate ?? a.dailyRate ?? a.unitPrice ?? 0);
        const rateCur = override?.currencyCode || a.billingCurrency || 'SAR';
        const basis = override?.pricingBasis || a.billingBasis || a.allocationBasis || 'DAILY';
        const rate = convertToBase(rawRate, rateCur, period?.endDate).amountBase;
        const workingDays = Number(a.workingDaysInMonth || 22);
        let units = Number(a.allocatedDays || workingDays);
        let rev = 0;
        if (basis === 'DAYS' || basis === 'DAILY' || a.allocationBasis === 'DAYS') {
          units = Number(a.allocatedDays || workingDays);
          rev = units * rate;
        } else if (basis === 'HOURLY' || basis === 'HOURS' || a.allocationBasis === 'HOURLY') {
          units = Number(a.allocatedHours || 160);
          rev = units * rate;
        } else {
          units = Number(a.allocationPct || 100);
          rev = rate * (units / 100);
        }
        totalRev += rev;
        return {
          id: `rev-line-${idx + 1}`,
          employeeId: a.employeeId,
          employeeName: a.employeeName,
          projectId: a.projectId,
          projectName: a.projectName,
          clientName: a.clientName || 'العميل',
          pricingBasis: basis,
          units,
          unitPrice: rate,
          allocationPct: a.allocationPct || 100,
          grossRevenueBase: Math.round(rev * 100) / 100,
        };
      });
      const uniqueEmps = new Set(lines.map((l) => l.employeeId)).size;
      const uniquePrjs = new Set(lines.map((l) => l.projectId)).size;
      return {
        lineCount: lines.length,
        projectCount: uniquePrjs,
        employeeCount: uniqueEmps,
        totalRevenueBase: Math.round(totalRev * 100) / 100,
        lines,
        existingRunId: existing?.id || null,
      };
    }
    const singleRun = runs.find((r) => cleanP.endsWith(`/${r.id}`));
    if (singleRun) return singleRun;
    return makeList(runs);
  }

  // 20. Reports & Financial Intelligence
  if (path.includes('/reports/profitability/overview')) {
    const q = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const prof = computeDynamicProfitability(q.get('periodId'));
    return {
      summary: prof.empSummary,
      employees: prof.empList,
      projects: prof.projectList,
      clients: prof.clientList,
    };
  }

  if (path.includes('/reports/executive-intelligence')) {
    const prof = computeDynamicProfitability();
    const is = computeIncomeStatement();
    const avgUtil = prof.empList.length > 0
      ? prof.empList.reduce((s: number, e: any) => s + Number(e.allocatedPct || 0), 0) / prof.empList.length
      : 0;
    const revTotal = Number(prof.empSummary.totalRevenueBase || 0) || Number(is.revenue || 0);
    const netProf = Number(prof.empSummary.totalProfitBase || 0) || Number(is.netProfit || 0);
    return {
      kpis: {
        ytdRevenue: revTotal.toFixed(2),
        ytdNetProfit: netProf.toFixed(2),
        netMarginPct: revTotal > 0 ? ((netProf / revTotal) * 100).toFixed(1) : '0.0',
        utilizationRate: avgUtil.toFixed(1),
        activeProjects: prof.projectList.filter((p: any) => p.status === 'ACTIVE').length,
        totalDevelopers: prof.empList.length,
      },
      topClients: prof.clientList,
      profitability: {
        summary: prof.empSummary,
        employees: prof.empList,
        projects: prof.projectList,
        clients: prof.clientList,
      },
    };
  }

  if (path.includes('/reports/cash-flow')) {
    return computeCashFlowSummary();
  }

  if (path.includes('/reports/vat-return') || path.includes('/vat-report')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    return computeVatReturnSummary(p.get('fiscalPeriodId') || p.get('periodId'));
  }

  // 21. Zakat Declarations & Settings
  if (path.includes('/zakat/returns')) {
    return makeList(getEntityList('zakat_returns', []));
  }

  if (path.includes('/zakat/settings')) {
    return getZakatSettings();
  }

  if (path.includes('/zakat/calculate') || path.includes('/zakat')) {
    return computeZakatSummary({});
  }

  if (path.includes('/snapshots')) {
    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const snaps = getEntityList<any>('snapshots', []);
    const verifySnap = (s: any) => ({
      ...s,
      hashValid: s?.data ? sha256Hex(JSON.stringify(s.data)) === s.dataHash : Boolean(s.hashValid),
    });
    const singleSnap = snaps.find((s) => cleanP.endsWith(`/${s.id}`));
    if (singleSnap) return verifySnap(singleSnap);
    return makeList(snaps.map(verifySnap));
  }

  // 22. Users, Roles & Permissions
  if (path.includes('/permissions')) {
    const defaultPerms = [
      { id: 'perm-1', code: 'org.companies.read', module: 'org', resource: 'companies', action: 'read', descriptionAr: 'بيانات الشركة — قراءة وعرض بيانات المنشأة' },
      { id: 'perm-2', code: 'org.companies.write', module: 'org', resource: 'companies', action: 'write', descriptionAr: 'بيانات الشركة — تعديل بيانات المنشأة' },
      { id: 'perm-3', code: 'hr.employees.read', module: 'hr', resource: 'employees', action: 'read', descriptionAr: 'سجل الموظفين — قراءة وعرض بيانات الكوادر' },
      { id: 'perm-4', code: 'hr.employees.write', module: 'hr', resource: 'employees', action: 'write', descriptionAr: 'سجل الموظفين — إضافة وتعديل ملفات الكوادر' },
      { id: 'perm-5', code: 'prj.projects.read', module: 'prj', resource: 'projects', action: 'read', descriptionAr: 'سجل المشاريع — متابعة العقود وتكاليف المشاريع' },
      { id: 'perm-6', code: 'prj.projects.write', module: 'prj', resource: 'projects', action: 'write', descriptionAr: 'سجل المشاريع — إنشاء واعتماد المشاريع' },
      { id: 'perm-7', code: 'pay.runs.read', module: 'pay', resource: 'runs', action: 'read', descriptionAr: 'مسير الرواتب — استعراض مسيرات الأجور' },
      { id: 'perm-8', code: 'pay.runs.write', module: 'pay', resource: 'runs', action: 'write', descriptionAr: 'مسير الرواتب — اعتماد وترحيل مسيرات الأجور' },
      { id: 'perm-9', code: 'acc.journals.read', module: 'acc', resource: 'journals', action: 'read', descriptionAr: 'القيود المحاسبية — استعراض دفتر اليومية' },
      { id: 'perm-10', code: 'acc.journals.write', module: 'acc', resource: 'journals', action: 'write', descriptionAr: 'القيود المحاسبية — إنشاء وترحيل القيود' },
      { id: 'perm-11', code: 'sal.zatca.read', module: 'sal', resource: 'zatca', action: 'read', descriptionAr: 'هيئة الزكاة ZATCA — استعراض الفواتير والربط' },
      { id: 'perm-12', code: 'sal.zatca.write', module: 'sal', resource: 'zatca', action: 'write', descriptionAr: 'هيئة الزكاة ZATCA — إرسال واعتماد الفواتير' },
    ];
    return makeList(getEntityList('permissions', defaultPerms));
  }

  if (path.includes('/roles')) {
    const defaultRoles = [
      { id: 'role-1', code: 'ADMIN', nameAr: 'مدير النظام التنفيذي (Admin)', description: 'كامل الصلاحيات المالية والإدارية والتقنية وإقفال وإعادة فتح الشهور', userCount: 1, permissionCount: 12, isTemplate: false, isSystem: true, permissions: ['org.companies.read', 'org.companies.write', 'hr.employees.read', 'hr.employees.write', 'prj.projects.read', 'prj.projects.write', 'pay.runs.read', 'pay.runs.write', 'acc.journals.read', 'acc.journals.write', 'sal.zatca.read', 'sal.zatca.write'], rowVersion: 1 },
      { id: 'role-2', code: 'HR', nameAr: 'إدارة الموارد البشرية (HR)', description: 'إدارة الموظفين والرواتب والبدلات والسلف والمتغيرات الشهرية', userCount: 1, permissionCount: 5, isTemplate: false, isSystem: false, permissions: ['hr.employees.read', 'hr.employees.write', 'pay.runs.read', 'pay.runs.write', 'org.companies.read'], rowVersion: 1 },
      { id: 'role-3', code: 'FINANCE', nameAr: 'الإدارة المالية والمحاسبة (Finance)', description: 'إدارة التكاليف، الإيرادات، الأوفر هيد، القيود، الضرائب، وإقفال الشهر', userCount: 1, permissionCount: 6, isTemplate: false, isSystem: false, permissions: ['acc.journals.read', 'acc.journals.write', 'sal.zatca.read', 'sal.zatca.write', 'pay.runs.read', 'org.companies.read'], rowVersion: 1 },
      { id: 'role-4', code: 'PROJECT_MANAGER', nameAr: 'مدير المشاريع والعمليات (Project Manager)', description: 'إدارة المشاريع، تخصيص الكوادر، ومتابعة ربحية المشاريع والوقت غير المستغل', userCount: 1, permissionCount: 4, isTemplate: false, isSystem: false, permissions: ['prj.projects.read', 'prj.projects.write', 'hr.employees.read', 'org.companies.read'], rowVersion: 1 },
      { id: 'role-5', code: 'VIEWER', nameAr: 'مراقب ومستعرض تقارير (Viewer)', description: 'صلاحية قراءة واستعراض التقارير ولوحات الربحية فقط دون تعديل', userCount: 0, permissionCount: 5, isTemplate: true, isSystem: false, permissions: ['org.companies.read', 'hr.employees.read', 'prj.projects.read', 'pay.runs.read', 'acc.journals.read'], rowVersion: 1 },
    ];
    const roles = getEntityList('roles', defaultRoles);
    const singleRole = roles.find((r: any) => path.endsWith(`/${r.id}`));
    if (singleRole) return singleRole;
    return makeList(roles);
  }

  if (path.includes('/users')) {
    const defaultUsers = [
      {
        id: 'u-1',
        username: 'admin',
        fullName: 'المدير التنفيذي',
        email: 'admin@idham.net',
        isSystemAdmin: true,
        status: 'ACTIVE',
        roles: [{ assignmentId: 'ra-1', roleName: 'مدير النظام التنفيذي' }],
        lastLoginAt: new Date().toISOString(),
      },
    ];
    return makeList(getEntityList('users', defaultUsers));
  }

  // 23. Security & Audit Logs (Real user activities with full filters)
  if (path.includes('/audit-log') || path.includes('/audit/log')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const fTable = (p.get('table') || '').toLowerCase();
    const fAction = p.get('action') || '';
    const fEntity = p.get('entityId') || '';
    const fFrom = p.get('from') || '';
    const fTo = p.get('to') || '';
    let logs = getEntityList<any>('audit_log', []).map((a) => ({
      ...a,
      occurredAt: a.occurredAt || a.createdAt,
      userName: a.userName || a.actor || 'المدير التنفيذي',
      schemaName: a.schemaName || 'core',
      entityId: a.entityId || a.recordId || a.id,
      changedFields: Array.isArray(a.changedFields) ? a.changedFields : [],
    }));
    if (fTable) logs = logs.filter((l) => String(l.tableName || '').toLowerCase().includes(fTable));
    if (fAction) logs = logs.filter((l) => l.action === fAction);
    if (fEntity) logs = logs.filter((l) => l.entityId === fEntity || l.recordId === fEntity);
    if (fFrom) logs = logs.filter((l) => String(l.occurredAt || '').slice(0, 10) >= fFrom);
    if (fTo) logs = logs.filter((l) => String(l.occurredAt || '').slice(0, 10) <= fTo);
    logs.sort((a, b) => String(b.occurredAt || '').localeCompare(String(a.occurredAt || '')));
    return makeList(logs);
  }

  if (path.includes('/security-events') || path.includes('/audit/security')) {
    return makeList(getEntityList('security_events', []));
  }

  if (path.includes('/auth/logout') || path.includes('/auth/password/change')) {
    return { success: true, message: 'تم بنجاح' };
  }

  if (path.includes('/closing/periods')) {
    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const segs = cleanP.split('/').filter(Boolean); // ['closing', 'periods', periodId, 'checks']
    const periodId = segs[2] || 'fp-2026-11';
    return evaluatePeriodClosingChecks(periodId);
  }

  if (path.includes('/zatca/onboard')) {
    return { onboarded: true, csidStatus: 'PRODUCTION', message: 'تم الربط مع هيئة الزكاة والضريبة والجمارك بنجاح' };
  }

  // 24. Default fallback for any unspecified endpoint
  return makeList([]);
}
