import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { CrudConfig, CrudRepository } from '../../../shared/crud';

/** Whitelisted master-data repositories of the core module (company scoped). */

const audit = { createdAt: 'created_at', updatedAt: 'updated_at', rowVersion: 'row_version' };

export const BRANCHES: CrudConfig = {
  entity: 'Branch',
  table: 'core.branches',
  columns: { id: 'id', code: 'code', nameAr: 'name_ar', nameEn: 'name_en', address: 'address', isActive: 'is_active', ...audit },
  writable: ['code', 'nameAr', 'nameEn', 'address', 'isActive'],
  searchColumns: ['code', 'name_ar', 'name_en'],
  sortable: { code: 't.code', nameAr: 't.name_ar', createdAt: 't.created_at' },
  defaultSort: 't.code ASC',
  filterable: ['isActive'],
};

export const COST_CENTERS: CrudConfig = {
  entity: 'CostCenter',
  table: 'core.cost_centers',
  columns: {
    id: 'id', parentId: 'parent_id', code: 'code', nameAr: 'name_ar', nameEn: 'name_en', ccType: 'cc_type',
    isPosting: 'is_posting', isActive: 'is_active', ...audit,
  },
  writable: ['parentId', 'code', 'nameAr', 'nameEn', 'ccType', 'isPosting', 'isActive'],
  searchColumns: ['code', 'name_ar', 'name_en'],
  sortable: { code: 't.code', nameAr: 't.name_ar' },
  defaultSort: 't.code ASC',
  filterable: ['isActive', 'ccType', 'parentId'],
};

export const DEPARTMENTS: CrudConfig = {
  entity: 'Department',
  table: 'core.departments',
  columns: {
    id: 'id', branchId: 'branch_id', parentId: 'parent_id', code: 'code', nameAr: 'name_ar', nameEn: 'name_en',
    managerEmployeeId: 'manager_employee_id', defaultCostCenterId: 'default_cost_center_id', isActive: 'is_active', ...audit,
  },
  writable: ['branchId', 'parentId', 'code', 'nameAr', 'nameEn', 'managerEmployeeId', 'defaultCostCenterId', 'isActive'],
  searchColumns: ['code', 'name_ar', 'name_en'],
  sortable: { code: 't.code', nameAr: 't.name_ar' },
  defaultSort: 't.code ASC',
  filterable: ['isActive', 'branchId', 'parentId'],
};

export const WORK_CALENDARS: CrudConfig = {
  entity: 'WorkCalendar',
  table: 'core.work_calendars',
  columns: {
    id: 'id', code: 'code', name: 'name', weekendDays: 'weekend_days', stdHoursPerDay: 'std_hours_per_day',
    isDefault: 'is_default', ...audit,
  },
  writable: ['code', 'name', 'weekendDays', 'stdHoursPerDay', 'isDefault'],
  searchColumns: ['code', 'name'],
  sortable: { code: 't.code', name: 't.name' },
  defaultSort: 't.code ASC',
};

export const TAX_CODES: CrudConfig = {
  entity: 'TaxCode',
  table: 'core.tax_codes',
  columns: { id: 'id', code: 'code', name: 'name', taxType: 'tax_type', accountId: 'account_id', isActive: 'is_active', ...audit },
  writable: ['code', 'name', 'taxType', 'accountId', 'isActive'],
  searchColumns: ['code', 'name'],
  sortable: { code: 't.code', name: 't.name' },
  defaultSort: 't.code ASC',
  filterable: ['isActive', 'taxType'],
};

export const BRANCH_REPO = 'BRANCH_REPO';
export const COST_CENTER_REPO = 'COST_CENTER_REPO';
export const DEPARTMENT_REPO = 'DEPARTMENT_REPO';
export const CALENDAR_REPO = 'CALENDAR_REPO';
export const TAX_CODE_REPO = 'TAX_CODE_REPO';

export const coreRepositoryProviders = [
  { provide: BRANCH_REPO, useFactory: (db: DbService) => new CrudRepository(db, BRANCHES), inject: [DbService] },
  { provide: COST_CENTER_REPO, useFactory: (db: DbService) => new CrudRepository(db, COST_CENTERS), inject: [DbService] },
  { provide: DEPARTMENT_REPO, useFactory: (db: DbService) => new CrudRepository(db, DEPARTMENTS), inject: [DbService] },
  { provide: CALENDAR_REPO, useFactory: (db: DbService) => new CrudRepository(db, WORK_CALENDARS), inject: [DbService] },
  { provide: TAX_CODE_REPO, useFactory: (db: DbService) => new CrudRepository(db, TAX_CODES), inject: [DbService] },
];

// ---------------------------------------------------------------- schemas
const code = z.string().trim().min(1).max(30);
const name = z.string().trim().min(1).max(200);
const optText = z.string().trim().max(500).nullable().optional();
const optUuid = z.string().uuid().nullable().optional();

export const BranchCreate = z.object({ code, nameAr: name, nameEn: optText, address: optText, isActive: z.boolean().optional() });
export const BranchUpdate = BranchCreate.partial();

export const CostCenterCreate = z.object({
  parentId: optUuid,
  code,
  nameAr: name,
  nameEn: optText,
  ccType: z.enum(['DIRECT', 'INDIRECT', 'ADMIN']).default('DIRECT'),
  isPosting: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export const CostCenterUpdate = CostCenterCreate.partial();

export const DepartmentCreate = z.object({
  branchId: optUuid,
  parentId: optUuid,
  code,
  nameAr: name,
  nameEn: optText,
  managerEmployeeId: optUuid,
  defaultCostCenterId: optUuid,
  isActive: z.boolean().optional(),
});
export const DepartmentUpdate = DepartmentCreate.partial();

export const CalendarCreate = z.object({
  code,
  name,
  weekendDays: z.array(z.number().int().min(1).max(7)).max(7),
  stdHoursPerDay: z.union([z.string(), z.number()]).transform(String).refine((v) => Number(v) > 0 && Number(v) <= 24),
  isDefault: z.boolean().optional(),
});
export const CalendarUpdate = CalendarCreate.partial();

export const TaxCodeCreate = z.object({
  code,
  name,
  taxType: z.enum(['VAT_OUTPUT', 'VAT_INPUT', 'WITHHOLDING', 'PAYROLL_TAX']),
  accountId: optUuid,
  isActive: z.boolean().optional(),
});
export const TaxCodeUpdate = TaxCodeCreate.partial();
