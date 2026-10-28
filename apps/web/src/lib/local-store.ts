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
  window.dispatchEvent(new CustomEvent('idham_all_purged'));
}

// Auto-run one-time purge of legacy mock data on startup
if (typeof window !== 'undefined') {
  const PURGE_KEY = 'idham_clean_prod_baseline_v3';
  if (!localStorage.getItem(PURGE_KEY)) {
    purgeAllMockData();
    localStorage.setItem(PURGE_KEY, 'true');
  }
}
