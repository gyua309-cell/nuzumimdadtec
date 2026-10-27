/**
 * Persistent Local Store for Production-Ready ERP Frontend
 * Enables live creation, editing, deletion, and retrieval of records
 * in localStorage when operating on static hosting (GitHub Pages).
 */

export function getEntityList<T = any>(entityKey: string, initialDefaults: T[] = []): T[] {
  if (typeof window === 'undefined') return initialDefaults;
  try {
    const raw = localStorage.getItem(`azm_prod_${entityKey}`);
    if (!raw) {
      // Store initial empty or baseline list
      localStorage.setItem(`azm_prod_${entityKey}`, JSON.stringify(initialDefaults));
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
    localStorage.setItem(`azm_prod_${entityKey}`, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(`azm_${entityKey}_updated`, { detail: list }));
  }
  return result;
}

export function deleteEntityItem(entityKey: string, id: string): boolean {
  const list = getEntityList<any>(entityKey);
  const filtered = list.filter((x) => x.id !== id);
  if (typeof window !== 'undefined') {
    localStorage.setItem(`azm_prod_${entityKey}`, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent(`azm_${entityKey}_updated`, { detail: filtered }));
  }
  return filtered.length !== list.length;
}
