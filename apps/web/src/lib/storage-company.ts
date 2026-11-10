/**
 * Company settings storage helper.
 * Handles persistence to localStorage, synchronizing between
 * API fallback, AuthProvider, TopBar, Sidebar, and CompanyPage.
 */

export interface CompanyData {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  legalName: string;
  taxNumber: string;
  commercialReg: string;
  countryCode: string;
  timezone: string;
  address: string;
  baseCurrency: string;
  fiscalYearStartMonth: number;
  rowVersion: number;
}

const STORAGE_KEY = 'idham_company_data';

export const INITIAL_COMPANY: CompanyData = {
  id: '01a105ec-6a9a-74cd-b663-0ef527c4cfde',
  code: 'IMDAD',
  nameAr: 'شركة نظم إمداد للتقنية والحلول الرقمية',
  nameEn: 'Nuzum Imdad Technology Co.',
  legalName: 'شركة نظم إمداد للتقنية والحلول الرقمية - شركة شخص واحد ش.م.م',
  taxNumber: '310123456700003',
  commercialReg: '1010789456',
  countryCode: 'SA',
  timezone: 'Asia/Riyadh',
  address: 'المملكة العربية السعودية - الرياض - طريق الملك فهد',
  baseCurrency: 'SAR',
  fiscalYearStartMonth: 1,
  rowVersion: 1,
};

export function getStoredCompany(): CompanyData {
  if (typeof window === 'undefined') return { ...INITIAL_COMPANY };
  try {
    // Purge old legacy keys
    localStorage.removeItem('azm_erp_company_data');
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_COMPANY));
      return { ...INITIAL_COMPANY };
    }
    const parsed = JSON.parse(raw);
    // If the cached object has old mock name "عزم", sanitize it immediately
    if (parsed.nameAr && parsed.nameAr.includes('عزم')) {
      parsed.nameAr = INITIAL_COMPANY.nameAr;
      parsed.nameEn = INITIAL_COMPANY.nameEn;
      parsed.legalName = INITIAL_COMPANY.legalName;
      parsed.code = INITIAL_COMPANY.code;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
    return { ...INITIAL_COMPANY, ...parsed };
  } catch {
    return { ...INITIAL_COMPANY };
  }
}

export function saveStoredCompany(patch: Partial<CompanyData>): CompanyData {
  const current = getStoredCompany();
  const updated: CompanyData = {
    ...current,
    ...patch,
    rowVersion: (current.rowVersion || 1) + 1,
  };
  Object.assign(INITIAL_COMPANY, updated);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('idham_company_updated', { detail: updated }));
      window.dispatchEvent(new CustomEvent('azm_company_updated', { detail: updated }));
    } catch (err) {
      console.error('Failed to save company to localStorage:', err);
    }
  }
  return updated;
}
