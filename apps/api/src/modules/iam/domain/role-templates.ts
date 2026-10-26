/**
 * Role templates from the permission design (doc 05 §7.3). These are SYSTEM
 * CONFIGURATION created during setup (editable / clonable afterwards) — not
 * business data. Patterns: "module.resource.action", "*" wildcards allowed.
 */
export interface RoleTemplate {
  code: string;
  nameAr: string;
  nameEn: string;
  grants: string[];
  denies?: string[];
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    code: 'CFO',
    nameAr: 'المدير المالي',
    nameEn: 'Chief Financial Officer',
    grants: ['*.*.view', '*.*.export', '*.*.print', '*.*.approve', '*.*.post', '*.*.cancel', 'close.*.*', 'acc.*.*',
      'cost.*.*', 'rev.*.*', 'exp.*.*', 'wf.*.*', 'core.fx.*', 'core.fiscal.*', 'hr.compensation.view_sensitive',
      'cost.profitability.view_sensitive', 'dash.dashboard.view_sensitive', 'pay.run.view_sensitive', 'rpt.*.view_sensitive'],
    denies: ['iam.*.create', 'iam.*.edit', 'iam.*.delete'],
  },
  {
    code: 'ACCOUNTANT',
    nameAr: 'محاسب',
    nameEn: 'Accountant',
    grants: ['acc.*.view', 'acc.*.create', 'acc.*.edit', 'acc.journal.post', 'acc.ledger.*', 'core.*.view', 'core.fx.create',
      'core.fx.edit', 'rev.*.view', 'rev.*.create', 'rev.*.edit', 'rev.*.post', 'exp.*.view', 'exp.*.create', 'exp.*.edit',
      'exp.*.post', 'ast.*.view', 'ast.*.create', 'ast.*.edit', 'ast.*.post', 'pay.loan.post', 'rpt.financial.*',
      'rpt.receivables.*', 'rpt.payables.*', 'rpt.assets.*', 'rpt.tax.*', 'cost.*.view', 'cost.overhead.create',
      'cost.overhead.edit', 'wf.adjustment.create', 'wf.adjustment.edit', 'wf.adjustment.view', 'close.period.view', 'dash.dashboard.view'],
  },
  {
    code: 'PAYROLL_OFFICER',
    nameAr: 'مسؤول رواتب',
    nameEn: 'Payroll Officer',
    grants: ['pay.*.view', 'pay.*.create', 'pay.*.edit', 'pay.run.cancel', 'pay.run.view_sensitive', 'hr.employee.view',
      'hr.employee.view_sensitive', 'hr.compensation.*', 'cost.profile.*', 'rpt.hr.*', 'core.*.view'],
    denies: ['hr.compensation.approve'],
  },
  {
    code: 'HR_MANAGER',
    nameAr: 'مدير الموارد البشرية',
    nameEn: 'HR Manager',
    grants: ['hr.*.*', 'pay.variable.view', 'pay.variable.approve', 'pay.loan.view', 'pay.loan.approve', 'core.department.*',
      'core.*.view', 'cost.profile.view', 'prj.*.view', 'rpt.hr.*', 'wf.approval.view', 'wf.approval.approve', 'dash.dashboard.view'],
  },
  {
    code: 'HR_OFFICER',
    nameAr: 'موظف موارد بشرية',
    nameEn: 'HR Officer',
    grants: ['hr.employee.view', 'hr.employee.create', 'hr.employee.edit', 'hr.document.*', 'hr.position.view',
      'pay.variable.view', 'pay.variable.create', 'pay.loan.view', 'pay.loan.create', 'rpt.hr.view', 'core.*.view'],
  },
  {
    code: 'PROJECT_MANAGER',
    nameAr: 'مدير مشروع',
    nameEn: 'Project Manager',
    grants: ['prj.*.view', 'prj.project.edit', 'prj.assignment.create', 'prj.assignment.edit', 'pay.variable.view',
      'pay.variable.create', 'cost.profitability.view', 'rev.run.view', 'wf.adjustment.create', 'wf.adjustment.view',
      'wf.approval.view', 'wf.approval.approve', 'rpt.projects.view', 'hr.employee.view', 'dash.dashboard.view'],
  },
  {
    code: 'AUDITOR',
    nameAr: 'مدقق',
    nameEn: 'Auditor',
    grants: ['*.*.view', '*.*.export', '*.*.print', '*.*.view_sensitive'],
  },
  {
    code: 'EXECUTIVE',
    nameAr: 'الإدارة العليا',
    nameEn: 'Executive Management',
    grants: ['dash.dashboard.*', 'rpt.*.view', 'rpt.*.export', 'cost.profitability.*', 'wf.approval.view', 'wf.approval.approve',
      'prj.*.view', 'hr.employee.view', 'audit.log.view'],
  },
];

export function matchesPattern(code: string, pattern: string): boolean {
  const c = code.split('.');
  const p = pattern.split('.');
  return p.length === 3 && p.every((seg, i) => seg === '*' || seg === c[i]);
}

export function expandTemplate(t: RoleTemplate, catalogue: string[]): string[] {
  return catalogue.filter(
    (code) => t.grants.some((g) => matchesPattern(code, g)) && !(t.denies ?? []).some((d) => matchesPattern(code, d)),
  );
}
