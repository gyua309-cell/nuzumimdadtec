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
    window.dispatchEvent(new CustomEvent('idham_entity_mutation', { detail: { entityKey, item: result } }));
  }
  return result;
}

export function deleteEntityItem(entityKey: string, id: string): boolean {
  const list = getEntityList<any>(entityKey);
  const next = list.filter((x) => x.id !== id);
  if (next.length !== list.length) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`${STORAGE_PREFIX}${entityKey}`, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(`idham_${entityKey}_updated`, { detail: next }));
      window.dispatchEvent(new CustomEvent('idham_entity_mutation', { detail: { entityKey, deletedId: id } }));
    }
    return true;
  }
  return false;
}

/**
 * Purges lingering demo keys while preserving company settings.
 */
export function purgeAllMockData() {
  if (typeof window === 'undefined') return;
  const existingCompany = localStorage.getItem('idham_company_data');
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith('azm_') || k.startsWith('idham_mock_') || k.startsWith('demo_'))) {
      if (k !== 'idham_company_data') {
        toRemove.push(k);
      }
    }
  }
  for (const k of toRemove) {
    localStorage.removeItem(k);
  }
  // Clear any mock entity lists that had fake data
  const mockKeysToClean = ['invoices', 'assignments', 'employees', 'projects', 'clients', 'journal_entries', 'revenue_runs', 'loans', 'custodies'];
  for (const key of mockKeysToClean) {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // Only clear obsolete legacy demo collections from old builds that had the old hardcoded demo company
        if (Array.isArray(parsed) && parsed.some((x: any) => x.isLegacyMock === true || x.customerName === 'شركة عزم للتكنولوجيا والحلول الرقمية' || x.sellerName === 'شركة عزم للتكنولوجيا والحلول الرقمية')) {
          localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
        }
      } catch {
        localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      }
    }
  }

  if (existingCompany) {
    localStorage.setItem('idham_company_data', existingCompany);
  }
  sanitizeLegacyMockData();
  window.dispatchEvent(new CustomEvent('idham_all_purged'));
}

/**
 * Proactively sanitizes lingering mock records injected by obsolete demo builds
 */
export function sanitizeLegacyMockData() {
  if (typeof window === 'undefined') return;

  // Clean employees: ONLY remove obsolete dummy records, NEVER remove legitimate user employees
  const rawEmps = localStorage.getItem(`${STORAGE_PREFIX}employees`);
  if (rawEmps) {
    try {
      const parsed: any[] = JSON.parse(rawEmps);
      const cleaned = parsed.filter(
        (e) => !e.isLegacyMock && e.fullNameAr !== 'مهندس برمجيات تجريبي'
      );
      if (cleaned.length !== parsed.length) {
        localStorage.setItem(`${STORAGE_PREFIX}employees`, JSON.stringify(cleaned));
      }
    } catch {
      localStorage.removeItem(`${STORAGE_PREFIX}employees`);
    }
  }

  // Clean invoices: ONLY remove obsolete dummy invoices from the old demo company
  const rawInvs = localStorage.getItem(`${STORAGE_PREFIX}invoices`);
  if (rawInvs) {
    try {
      const parsed: any[] = JSON.parse(rawInvs);
      const cleaned = parsed.filter(
        (inv) => !inv.isLegacyMock && inv.customerName !== 'شركة عزم للتكنولوجيا والحلول الرقمية' && inv.sellerName !== 'شركة عزم للتكنولوجيا والحلول الرقمية'
      );
      if (cleaned.length !== parsed.length) {
        localStorage.setItem(`${STORAGE_PREFIX}invoices`, JSON.stringify(cleaned));
      }
    } catch {
      localStorage.removeItem(`${STORAGE_PREFIX}invoices`);
    }
  }
}

/**
 * Resets all business records to clean zero baseline (0.00 / empty),
 * while preserving the company registration profile and branding.
 */
export function resetSystemToZero() {
  if (typeof window === 'undefined') return;
  const company = localStorage.getItem('idham_company_data');
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
  const PURGE_KEY = 'idham_clean_prod_baseline_v8';
  if (!localStorage.getItem(PURGE_KEY)) {
    resetSystemToZero();
    localStorage.setItem(PURGE_KEY, 'true');
  }
}
