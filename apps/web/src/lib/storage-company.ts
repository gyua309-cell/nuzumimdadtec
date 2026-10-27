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

const STORAGE_KEY = 'azm_erp_company_data';

export const INITIAL_COMPANY: CompanyData = {
  id: '01a17cb2-9afa-7ef5-91f6-b47561899afb',
  code: 'AZM',
  nameAr: 'شركة عزم للتكنولوجيا والحلول الرقمية',
  nameEn: 'Azm Tech Co.',
  legalName: 'شركة عزم للتكنولوجيا والحلول الرقمية - شركة مساهمة مقفلة',
  taxNumber: '310123456700003',
  commercialReg: '1010123456',
  countryCode: 'SA',
  timezone: 'Asia/Riyadh',
  address: 'المملكة العربية السعودية - الرياض - طريق الملك فهد - برج عزم',
  baseCurrency: 'SAR',
  fiscalYearStartMonth: 1,
  rowVersion: 1,
};

export function getStoredCompany(): CompanyData {
  if (typeof window === 'undefined') return { ...INITIAL_COMPANY };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_COMPANY));
      return { ...INITIAL_COMPANY };
    }
    const parsed = JSON.parse(raw);
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
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('azm_company_updated', { detail: updated }));
    } catch (err) {
      console.error('Failed to save company to localStorage:', err);
    }
  }
  return updated;
}
