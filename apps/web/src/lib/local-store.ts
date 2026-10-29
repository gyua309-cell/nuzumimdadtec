/**
 * Persistent Local Store for Production-Ready ERP Frontend
 * Enables live creation, editing, deletion, and retrieval of records
 * in localStorage when operating on static hosting (GitHub Pages).
 */

const STORAGE_PREFIX = 'idham_prod_';

export function getEntityList<T = any>(entityKey: string, initialDefaults: any = []): T[] {
  if (typeof window === 'undefined') return initialDefaults;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${entityKey}`);
    if (!raw) {
      localStorage.setItem(`${STORAGE_PREFIX}${entityKey}`, JSON.stringify(initialDefaults));
      return initialDefaults;
    }
    return JSON.parse(raw);
  } catch {
    return initialDefaults;
  }
}

export function saveEntityItem<T extends { id?: string }>(entityKey: string, item: T): T {
  const list = getEntityList<any>(entityKey);
  const now = new Date().toISOString();
  let result: any;

  if (item.id) {
    const idx = list.findIndex((x) => x.id === item.id);
    if (idx >= 0) {
      result = {
        ...list[idx],
        ...item,
        updatedAt: now,
        rowVersion: (list[idx].rowVersion || 1) + 1,
      };
      list[idx] = result;
    } else {
      result = {
        ...item,
        createdAt: now,
        updatedAt: now,
        rowVersion: 1,
      };
      list.unshift(result);
    }
  } else {
    result = {
      ...item,
      id: `${entityKey.slice(0, 3)}-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      rowVersion: 1,
    };
    list.unshift(result);
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(`${STORAGE_PREFIX}${entityKey}`, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(`idham_${entityKey}_updated`, { detail: list }));
  }
  return result;
}

export function deleteEntityItem(entityKey: string, id: string): boolean {
  const list = getEntityList<any>(entityKey);
  const filtered = list.filter((x) => x.id !== id && x.code !== id);
  if (typeof window !== 'undefined') {
    localStorage.setItem(`${STORAGE_PREFIX}${entityKey}`, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent(`idham_${entityKey}_updated`, { detail: filtered }));
  }
  return filtered.length !== list.length;
}

/** Complete purge of all demo, mock, and seed keys in user's browser (preserves company customizations) */
export function purgeAllMockData() {
  if (typeof window === 'undefined') return;
  const existingCompany = localStorage.getItem('idham_company_data') || localStorage.getItem('azm_erp_company_data');
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith('azm_') || k.startsWith('idham_mock_') || k.startsWith('demo_'))) {
      if (k !== 'azm_erp_company_data' && k !== 'idham_company_data') {
        toRemove.push(k);
      }
    }
  }
  for (const k of toRemove) {
    localStorage.removeItem(k);
  }
  if (existingCompany) {
    localStorage.setItem('idham_company_data', existingCompany);
    localStorage.setItem('azm_erp_company_data', existingCompany);
  }
  sanitizeLegacyMockData();
  window.dispatchEvent(new CustomEvent('idham_all_purged'));
}

/**
 * Proactively sanitizes lingering mock records injected by previous demo builds
 * (e.g. EMP-001, Islam Hassan, Sarah Mansoor, Software Engineering dept, etc.)
 * while strictly preserving user-entered real records.
 */
export function sanitizeLegacyMockData() {
  if (typeof window === 'undefined') return;

  const mockEmployeeCodes = new Set(['EMP-001', 'EMP-002', 'EMP-003']);
  const mockDeptCodes = new Set(['TECH', 'PMO', 'FIN', 'OPS']);
  const mockDeptIds = new Set(['dept-01', 'dept-02', 'dept-03', 'dept-04']);
  const mockCcCodes = new Set(['CC-DELIVERY', 'CC-RND', 'CC-ADMIN']);
  const mockCcIds = new Set(['cc-01', 'cc-02', 'cc-03']);

  // Clean employees
  const rawEmps = localStorage.getItem(`${STORAGE_PREFIX}employees`);
  if (rawEmps) {
    try {
      const parsed: any[] = JSON.parse(rawEmps);
      const cleaned = parsed.filter(
        (e) => !mockEmployeeCodes.has(e.code) && !e.fullNameAr?.includes('مهندس برمجيات أول') && !e.fullNameAr?.includes('إسلام حسن')
      );
      if (cleaned.length !== parsed.length) {
        localStorage.setItem(`${STORAGE_PREFIX}employees`, JSON.stringify(cleaned));
      }
    } catch {
      localStorage.removeItem(`${STORAGE_PREFIX}employees`);
    }
  }

  // Clean departments
  const rawDepts = localStorage.getItem(`${STORAGE_PREFIX}departments`);
  if (rawDepts) {
    try {
      const parsed: any[] = JSON.parse(rawDepts);
      const cleaned = parsed.filter((d) => !mockDeptCodes.has(d.code) && !mockDeptIds.has(d.id));
      if (cleaned.length !== parsed.length) {
        localStorage.setItem(`${STORAGE_PREFIX}departments`, JSON.stringify(cleaned));
      }
    } catch {
      localStorage.removeItem(`${STORAGE_PREFIX}departments`);
    }
  }

  // Clean cost centers
  const rawCc = localStorage.getItem(`${STORAGE_PREFIX}cost_centers`);
  if (rawCc) {
    try {
      const parsed: any[] = JSON.parse(rawCc);
      const cleaned = parsed.filter((c) => !mockCcCodes.has(c.code) && !mockCcIds.has(c.id));
      if (cleaned.length !== parsed.length) {
        localStorage.setItem(`${STORAGE_PREFIX}cost_centers`, JSON.stringify(cleaned));
      }
    } catch {
      localStorage.removeItem(`${STORAGE_PREFIX}cost_centers`);
    }
  }
}

/**
 * Resets all business records to clean zero baseline (0.00 / empty),
 * while preserving the company registration profile and branding.
 */
export function resetSystemToZero() {
  if (typeof window === 'undefined') return;
  const company = localStorage.getItem('idham_company_data') || localStorage.getItem('azm_erp_company_data');
  const toDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX)) {
      toDelete.push(k);
    }
  }
  for (const k of toDelete) {
    localStorage.removeItem(k);
  }
  purgeAllMockData();
  if (company) {
    localStorage.setItem('idham_company_data', company);
    localStorage.setItem('azm_erp_company_data', company);
  }
  window.dispatchEvent(new CustomEvent('idham_all_purged'));
}

/**
 * Exports entire system state (Company profile + all entity records) to a JSON file
 */
export function exportAllErpData(): void {
  if (typeof window === 'undefined') return;
  const bundle: Record<string, any> = {
    exportDate: new Date().toISOString(),
    version: '1.0.0',
    company: localStorage.getItem('idham_company_data') ? JSON.parse(localStorage.getItem('idham_company_data')!) : null,
    entities: {},
  };
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX)) {
      const entityKey = k.replace(STORAGE_PREFIX, '');
      try {
        bundle.entities[entityKey] = JSON.parse(localStorage.getItem(k)!);
      } catch {
        bundle.entities[entityKey] = localStorage.getItem(k);
      }
    }
  }
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `idham-erp-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Restores system state from an uploaded JSON backup file
 */
export function importAllErpData(jsonContent: string): { success: boolean; message: string } {
  try {
    const parsed = JSON.parse(jsonContent);
    if (parsed.company) {
      localStorage.setItem('idham_company_data', JSON.stringify(parsed.company));
      localStorage.setItem('azm_erp_company_data', JSON.stringify(parsed.company));
    }
    if (parsed.entities && typeof parsed.entities === 'object') {
      for (const [key, val] of Object.entries(parsed.entities)) {
        localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(val));
      }
    }
    window.dispatchEvent(new CustomEvent('idham_all_purged'));
    return { success: true, message: 'تم استعادة النسخة الاحتياطية بنجاح' };
  } catch (err: any) {
    return { success: false, message: `فشل استيراد الملف: ${err.message || 'تنسيق غير صالح'}` };
  }
}

// Auto-run proactive purge and mock data sanitization on startup
if (typeof window !== 'undefined') {
  const PURGE_KEY = 'idham_clean_prod_baseline_v5';
  if (!localStorage.getItem(PURGE_KEY)) {
    purgeAllMockData();
    sanitizeLegacyMockData();
    localStorage.setItem(PURGE_KEY, 'true');
  }
}
