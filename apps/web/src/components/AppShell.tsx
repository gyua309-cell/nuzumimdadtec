import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3, BookOpen, Briefcase, Building2, Calculator, ChevronDown, ChevronLeft,
  Coins, Command, FileText, Globe, Landmark, LayoutDashboard, LogOut, Menu, Moon, Package,
  PanelRightClose, Plus, Search, Settings, ShieldCheck, ShoppingCart, Sun, Users, Wallet, X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ErrorBoundary } from './ErrorBoundary';
import { JobsCenterButton } from './JobsCenterModal';

interface NavItem {
  to: string;
  label: string;
}

export type SectionColor = 'blue' | 'amber' | 'emerald' | 'indigo' | 'cyan' | 'teal' | 'violet' | 'green' | 'rose' | 'purple' | 'slate' | 'zinc';

export interface NavSection {
  key: string;
  label: string;
  icon: any;
  items?: NavItem[];
  to?: string;
  soon?: boolean;
  color?: SectionColor;
}

export interface NavGroup {
  key: string;
  label: string;
  sections: NavSection[];
}

const COLOR_CLASSES: Record<SectionColor, { iconBg: string; text: string; activeBorder: string; activeBg: string }> = {
  blue: {
    iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
    text: 'text-blue-700 dark:text-blue-300',
    activeBorder: 'border-blue-500',
    activeBg: 'bg-blue-50/80 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  amber: {
    iconBg: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
    text: 'text-amber-700 dark:text-amber-300',
    activeBorder: 'border-amber-500',
    activeBg: 'bg-amber-50/80 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  },
  emerald: {
    iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
    text: 'text-emerald-700 dark:text-emerald-300',
    activeBorder: 'border-emerald-500',
    activeBg: 'bg-emerald-50/80 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  indigo: {
    iconBg: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400',
    text: 'text-indigo-700 dark:text-indigo-300',
    activeBorder: 'border-indigo-500',
    activeBg: 'bg-indigo-50/80 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
  },
  cyan: {
    iconBg: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-400',
    text: 'text-cyan-700 dark:text-cyan-300',
    activeBorder: 'border-cyan-500',
    activeBg: 'bg-cyan-50/80 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
  },
  teal: {
    iconBg: 'bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400',
    text: 'text-teal-700 dark:text-teal-300',
    activeBorder: 'border-teal-500',
    activeBg: 'bg-teal-50/80 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  },
  violet: {
    iconBg: 'bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400',
    text: 'text-violet-700 dark:text-violet-300',
    activeBorder: 'border-violet-500',
    activeBg: 'bg-violet-50/80 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  },
  green: {
    iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
    text: 'text-emerald-700 dark:text-emerald-300',
    activeBorder: 'border-emerald-500',
    activeBg: 'bg-emerald-50/80 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  rose: {
    iconBg: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400',
    text: 'text-rose-700 dark:text-rose-300',
    activeBorder: 'border-rose-500',
    activeBg: 'bg-rose-50/80 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  },
  purple: {
    iconBg: 'bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400',
    text: 'text-purple-700 dark:text-purple-300',
    activeBorder: 'border-purple-500',
    activeBg: 'bg-purple-50/80 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  },
  slate: {
    iconBg: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    text: 'text-slate-800 dark:text-slate-200',
    activeBorder: 'border-slate-400',
    activeBg: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  },
  zinc: {
    iconBg: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    text: 'text-zinc-800 dark:text-zinc-200',
    activeBorder: 'border-zinc-400',
    activeBg: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200',
  },
};

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'overview',
    label: 'الرئيسية والمؤشرات التنفيذية',
    sections: [
      { key: 'dash', label: 'لوحة المؤشرات التنفيذية', icon: LayoutDashboard, to: '/', color: 'blue' },
    ],
  },
  {
    key: 'operations',
    label: 'المديولات التشغيلية والإدخالات',
    sections: [
      {
        key: 'hr',
        label: 'الموارد البشرية',
        icon: Users,
        color: 'emerald',
        items: [
          { to: '/hr/employees', label: 'سجل الموظفين' },
          { to: '/hr/positions', label: 'الهيكل الوظيفي' },
        ],
      },
      {
        key: 'cost',
        label: 'تكلفة الموظفين',
        icon: Calculator,
        color: 'indigo',
        items: [
          { to: '/cost/sheet', label: 'كشف التكاليف' },
          { to: '/cost/components', label: 'بنود التكلفة' },
          { to: '/cost/profiles', label: 'ملفات التكلفة' },
        ],
      },
      {
        key: 'pay',
        label: 'الرواتب والبدلات',
        icon: Wallet,
        color: 'violet',
        items: [
          { to: '/pay/runs', label: 'مسيّر الرواتب' },
          { to: '/pay/eosb', label: 'مكافأة نهاية الخدمة (نظام العمل)' },
          { to: '/reports/multi-currency-payroll', label: 'رواتب العملات (SAR/EGP)' },
          { to: '/pay/variables', label: 'البدلات والخصومات' },
          { to: '/pay/loans', label: 'سلف الموظفين' },
          { to: '/pay/variable-types', label: 'أنواع البدلات' },
        ],
      },
      {
        key: 'prj',
        label: 'المشاريع والمطورين',
        icon: Briefcase,
        color: 'cyan',
        items: [
          { to: '/prj/projects', label: 'سجل المشاريع' },
          { to: '/prj/clients', label: 'دليل العملاء' },
          { to: '/services/catalog', label: 'المخزون الخدمي (دليل الخدمات)' },
          { to: '/prj/employee-tracking', label: 'كروت تتبع الموظفين' },
          { to: '/prj/assignments', label: 'تخصيص الموظفين' },
          { to: '/prj/allocation-days', label: 'توزيع الأيام والنسب' },
          { to: '/prj/utilization', label: 'معدل استغلال الكوادر' },
          { to: '/prj/prices', label: 'أسعار الخدمات' },
        ],
      },
      {
        key: 'sal',
        label: 'المبيعات والفوترة',
        icon: FileText,
        color: 'emerald',
        items: [
          { to: '/sal/invoices', label: 'فواتير المبيعات' },
          { to: '/sal/credit-notes', label: 'إشعارات دائنة' },
          { to: '/zatca/hub', label: 'الربط مع هيئة الزكاة (ZATCA)' },
        ],
      },
      {
        key: 'pur',
        label: 'المشتريات والموردين',
        icon: ShoppingCart,
        color: 'amber',
        items: [
          { to: '/pur/invoices', label: 'فواتير المشتريات' },
          { to: '/pur/vendors', label: 'دليل الموردين' },
          { to: '/pur/debit-notes', label: 'إشعارات مدينة' },
        ],
      },
      {
        key: 'fin',
        label: 'العهد النقدية',
        icon: Coins,
        color: 'cyan',
        items: [
          { to: '/fin/custodies', label: 'إدارة العهد النقدية' },
          { to: '/reports/custody-movement', label: 'حركة وتسوية العهد' },
        ],
      },
      {
        key: 'ast',
        label: 'الأصول الثابتة',
        icon: Package,
        color: 'teal',
        items: [
          { to: '/assets/list', label: 'سجل الأصول' },
          { to: '/assets/categories', label: 'فئات الأصول' },
          { to: '/assets/depreciation', label: 'إهلاك الأصول' },
        ],
      },
      {
        key: 'acc',
        label: 'المحاسبة العامة',
        icon: BookOpen,
        color: 'blue',
        items: [
          { to: '/acc/accounts', label: 'شجرة الحسابات' },
          { to: '/acc/journals', label: 'قيود اليومية' },
          { to: '/acc/journals/new', label: 'سند قيد جديد' },
          { to: '/acc/banks', label: 'البنوك والتحويلات' },
          { to: '/acc/posting-rules', label: 'قواعد الترحيل' },
          { to: '/closing', label: 'إقفال الفترات' },
        ],
      },
    ],
  },
  {
    key: 'zatca',
    label: 'هيئة الزكاة والضريبة والجمارك (ZATCA 🇸🇦)',
    sections: [
      {
        key: 'zatca_main',
        label: 'منظومة ZATCA والربط المباشر',
        icon: ShieldCheck,
        color: 'emerald',
        items: [
          { to: '/zatca/hub', label: 'مركز القيادة والربط المباشر' },
          { to: '/zatca/invoices', label: 'الفواتير والاعتماد (مرحلة 1 و 2)' },
          { to: '/zatca/onboarding', label: 'تهيئة واعتماد الحل التقني (CSID)' },
          { to: '/zatca/qr-validator', label: 'فاحص ومفسر الرمز (QR Validator)' },
          { to: '/reports/zakat', label: 'إقرار الزكاة الشرعية والدخل' },
          { to: '/reports/vat-return', label: 'إقرار ضريبة القيمة المضافة (15%)' },
        ],
      },
    ],
  },
  {
    key: 'reporting',
    label: 'التقارير والقوائم المالية',
    sections: [
      {
        key: 'stmts',
        label: 'القوائم المالية',
        icon: Landmark,
        color: 'blue',
        items: [
          { to: '/reports/trial-balance', label: 'ميزان المراجعة' },
          { to: '/reports/income-statement', label: 'قائمة الدخل' },
          { to: '/reports/balance-sheet', label: 'الميزانية العمومية' },
          { to: '/reports/cash-flow', label: 'التدفقات النقدية' },
          { to: '/reports/account-statement', label: 'كشف الحساب' },
          { to: '/reports/zakat', label: 'الزكاة وضريبة الدخل' },
        ],
      },
      {
        key: 'analytics',
        label: 'التقارير التحليلية والرقابية',
        icon: BarChart3,
        color: 'purple',
        items: [
          { to: '/reports/executive-intelligence', label: 'الرقابة والذكاء المالي' },
          { to: '/reports/employee-profitability', label: 'ربحية الكوادر' },
          { to: '/reports/ar-aging', label: 'أعمار ديون العملاء' },
          { to: '/rev/profitability', label: 'ربحية المشاريع' },
          { to: '/rev/revenue', label: 'تحليل الإيرادات' },
          { to: '/prj/allocation-days', label: 'توزيع الأيام بالمبيعات' },
          { to: '/reports/vat-return', label: 'الإقرار الضريبي (ZATCA)' },
          { to: '/reports/custody-movement', label: 'تسوية العهد (SAR/EGP)' },
          { to: '/reports/multi-currency-payroll', label: 'رواتب العملات المجمعة' },
          { to: '/closing/snapshots', label: 'لقطات الإقفال' },
          { to: '/audit/log', label: 'سجل التدقيق' },
        ],
      },
    ],
  },
  {
    key: 'settings',
    label: 'الإعدادات والتهيئة العامة',
    sections: [
      {
        key: 'org',
        label: 'بيانات المؤسسة',
        icon: Building2,
        color: 'amber',
        items: [
          { to: '/org/company', label: 'بيانات الشركة والترخيص' },
          { to: '/org/branches', label: 'الفروع ومواقع العمل' },
          { to: '/org/departments', label: 'الأقسام والإدارات' },
          { to: '/org/cost-centers', label: 'مراكز التكلفة' },
          { to: '/org/currencies', label: 'العملات وأسعار الصرف' },
          { to: '/org/fiscal', label: 'السنوات والفترات المالية' },
          { to: '/org/calendars', label: 'تقويمات العمل والإجازات' },
          { to: '/org/taxes', label: 'الضرائب المعتمدة' },
        ],
      },
      {
        key: 'iam',
        label: 'الأمان والمستخدمين',
        icon: Settings,
        color: 'zinc',
        items: [
          { to: '/settings/users', label: 'إدارة المستخدمين' },
          { to: '/settings/roles', label: 'الأدوار والصلاحيات' },
          { to: '/audit/security', label: 'الأحداث وسجل الأمان' },
          { to: '/settings/password', label: 'تغيير كلمة المرور' },
        ],
      },
    ],
  },
];

// Flat list for backwards compatibility
export const NAV: NavSection[] = NAV_GROUPS.flatMap((g) => g.sections);

interface SearchEntry {
  to: string;
  label: string;
  sectionLabel: string;
  groupLabel: string;
  icon: any;
  color: SectionColor;
}

const ALL_SEARCH_ENTRIES: SearchEntry[] = (() => {
  const seen = new Set<string>();
  const list: SearchEntry[] = [];
  for (const g of NAV_GROUPS) {
    for (const s of g.sections) {
      if (s.to) {
        if (!seen.has(s.to)) {
          seen.add(s.to);
          list.push({
            to: s.to,
            label: s.label,
            sectionLabel: s.label,
            groupLabel: g.label,
            icon: s.icon,
            color: s.color || 'blue',
          });
        }
      }
      if (s.items) {
        for (const item of s.items) {
          const key = `${s.key}:${item.to}`;
          if (!seen.has(key)) {
            seen.add(key);
            list.push({
              to: item.to,
              label: item.label,
              sectionLabel: s.label,
              groupLabel: g.label,
              icon: s.icon,
              color: s.color || 'blue',
            });
          }
        }
      }
    }
  }
  return list;
})();

function useTheme() {
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('idham.theme', dark ? 'dark' : 'light');
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

function useDualClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const meccaTime = new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(now);

  const cairoTime = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(now);

  return { meccaTime, cairoTime };
}

function Section({
  s,
  collapsed,
  forceOpen,
  onNavigate,
}: {
  s: NavSection;
  collapsed?: boolean;
  forceOpen?: boolean;
  onNavigate?: () => void;
}) {
  const loc = useLocation();
  const active = s.items?.some((i) => loc.pathname === i.to || loc.pathname.startsWith(`${i.to}/`));
  const [open, setOpen] = useState(!!active);

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  const isExpanded = forceOpen || open;
  const color = COLOR_CLASSES[s.color || 'blue'];
  const base =
    'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-bold transition-all duration-150';

  if (s.to) {
    return (
      <NavLink
        to={s.to}
        end
        onClick={onNavigate}
        className={({ isActive }) =>
          `${base} ${
            isActive
              ? 'bg-amber-500/12 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 font-extrabold border-s-4 border-amber-500 shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white'
          }`
        }
        title={collapsed ? s.label : undefined}
      >
        {({ isActive }) => (
          <>
            <div
              className={`flex size-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-150 group-hover:scale-105 ${
                isActive ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : color.iconBg
              }`}
            >
              <s.icon className="size-4" />
            </div>
            {!collapsed && <span className="flex-1 whitespace-nowrap text-start text-[13px]">{s.label}</span>}
          </>
        )}
      </NavLink>
    );
  }

  return (
    <div>
      <button
        type="button"
        className={`${base} ${
          active
            ? 'bg-amber-500/12 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 font-extrabold border-s-4 border-amber-500'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white'
        }`}
        onClick={() => setOpen(!open)}
        title={collapsed ? s.label : undefined}
      >
        <div
          className={`flex size-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-150 group-hover:scale-105 ${
            active ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : color.iconBg
          }`}
        >
          <s.icon className="size-4" />
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 whitespace-nowrap text-start text-[13px]">{s.label}</span>
            <div className="flex items-center gap-1.5">
              {s.items && (
                <span className="rounded-md bg-slate-200/70 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                  {s.items.length}
                </span>
              )}
              <ChevronDown
                className={`size-3.5 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              />
            </div>
          </>
        )}
      </button>

      {!collapsed && isExpanded && s.items && (
        <div className="ms-6 mt-1 space-y-0.5 border-s-2 border-slate-200 dark:border-white/15 ps-2.5">
          {s.items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end
              onClick={onNavigate}
              className={({ isActive }) =>
                `group/sub flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[12px] transition-all duration-150 ${
                  isActive
                    ? 'bg-amber-500/15 font-extrabold text-amber-700 dark:text-amber-300 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white font-medium'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <span
                      className={`size-1.5 rounded-full transition-transform duration-150 ${
                        isActive
                          ? 'bg-amber-500 scale-125'
                          : 'bg-slate-400 dark:bg-slate-500 group-hover/sub:bg-slate-600 dark:group-hover/sub:bg-slate-300'
                      }`}
                    />
                    {i.label}
                  </span>
                  {isActive && <span className="size-1 rounded-full bg-amber-500" />}
                </>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { me, company, switchCompany, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const { meccaTime, cairoTime } = useDualClock();
  const qc = useQueryClient();
  const loc = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('idham.sidebar.collapsed') === 'true');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navFilter, setNavFilter] = useState('');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [cmdIndex, setCmdIndex] = useState(0);
  const cmdInputRef = useRef<HTMLInputElement>(null);

  // Active branch selector state (does NOT blank out companyId!)
  const [activeBranchId, setActiveBranchId] = useState<string>(() => localStorage.getItem('idham.activeBranchId') ?? '');

  // Ensure company stays valid if ever unset while me.companies exists
  useEffect(() => {
    if (!company && me?.companies && me.companies.length > 0) {
      switchCompany(me.companies[0].id);
    }
  }, [company, me, switchCompany]);

  // Query real branches of the active company
  const branchesQ = useQuery({
    queryKey: ['shell-branches', company?.id],
    queryFn: () => api.get<any>('/branches?limit=100'),
    enabled: !!company?.id,
    staleTime: 60_000,
  });

  const branches: Array<{ id: string; code: string; nameAr: string; countryCode?: string; functionalCurrency?: string }> = useMemo(() => {
    const raw = branchesQ.data;
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.items)) return raw.items;
    return [];
  }, [branchesQ.data]);

  // Global keyboard shortcut: Ctrl+K / Cmd+K for Command Palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
        setCmdQuery('');
        setCmdIndex(0);
      } else if (e.key === 'Escape' && cmdOpen) {
        setCmdOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cmdOpen]);

  useEffect(() => {
    if (cmdOpen) {
      setTimeout(() => cmdInputRef.current?.focus(), 40);
    }
  }, [cmdOpen]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [loc.pathname]);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('idham.sidebar.collapsed', String(next));
      return next;
    });
  };

  // Filtered sidebar groups
  const filteredNavGroups = useMemo(() => {
    const q = navFilter.trim().toLowerCase();
    if (!q) return NAV_GROUPS;
    return NAV_GROUPS.map((g) => {
      const sections = g.sections
        .map((s) => {
          const sectionMatch = s.label.toLowerCase().includes(q);
          if (s.to) return sectionMatch ? s : null;
          const matchingItems = (s.items || []).filter((i) => i.label.toLowerCase().includes(q));
          if (sectionMatch) return s;
          if (matchingItems.length > 0) return { ...s, items: matchingItems };
          return null;
        })
        .filter(Boolean) as NavSection[];
      return sections.length > 0 ? { ...g, sections } : null;
    }).filter(Boolean) as NavGroup[];
  }, [navFilter]);

  // Command palette matches
  const cmdMatches = useMemo(() => {
    const q = cmdQuery.trim().toLowerCase();
    if (!q) return ALL_SEARCH_ENTRIES.slice(0, 14);
    return ALL_SEARCH_ENTRIES.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.sectionLabel.toLowerCase().includes(q) ||
        e.groupLabel.toLowerCase().includes(q) ||
        e.to.toLowerCase().includes(q),
    ).slice(0, 18);
  }, [cmdQuery]);

  // Active route breadcrumb resolution
  const activeBreadcrumb = useMemo(() => {
    if (loc.pathname === '/') return null;
    for (const g of NAV_GROUPS) {
      for (const s of g.sections) {
        if (s.to && loc.pathname === s.to) {
          return { group: g.label, section: s.label, item: null as string | null };
        }
        if (s.items) {
          const exact = s.items.find((i) => loc.pathname === i.to);
          if (exact) return { group: g.label, section: s.label, item: exact.label };
          const prefix = s.items.find((i) => i.to !== '/' && loc.pathname.startsWith(`${i.to}/`));
          if (prefix) return { group: g.label, section: s.label, item: prefix.label };
        }
      }
    }
    return null;
  }, [loc.pathname]);

  const handleBranchChange = (branchId: string) => {
    setActiveBranchId(branchId);
    localStorage.setItem('idham.activeBranchId', branchId);
    window.dispatchEvent(new CustomEvent('idham_branch_changed', { detail: { branchId } }));
  };

  return (
    <div className="flex h-full bg-[#f3f6fb] dark:bg-[#070b14] text-slate-900 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/65 backdrop-blur-xs lg:hidden animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ─────────── Sidebar (Obsidian in Dark, Crisp Pearl in Light) ─────────── */}
      <aside
        className={`fixed inset-y-0 start-0 z-40 flex shrink-0 flex-col border-e border-slate-200/90 bg-white shadow-xl transition-all duration-300 dark:border-slate-800/80 dark:bg-[#0b1120] lg:static lg:z-auto ${
          mobileMenuOpen ? 'translate-x-0 w-72' : 'max-lg:translate-x-full'
        } ${collapsed ? 'lg:w-18' : 'lg:w-72'}`}
      >
        {/* Brand Logo Header with Hazard Stripes Badge */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 bg-slate-50/75 px-3.5 dark:border-slate-800/80 dark:bg-[#0f172a]">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <div className="hazard-badge flex size-9 shrink-0 items-center justify-center rounded-xl shadow-md border border-amber-500/40" />
            {(!collapsed || mobileMenuOpen) && (
              <div className="min-w-0 leading-tight animate-fade-in">
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] font-black tracking-tight text-slate-900 dark:text-white">IDHAM ERP</span>
                  <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-black text-amber-700 dark:text-amber-400 border border-amber-500/30">
                    PRO
                  </span>
                </div>
                <div className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400">
                  نظام الموارد البشرية والمحاسبة
                </div>
              </div>
            )}
          </Link>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="flex lg:hidden size-8 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-white/10"
              aria-label="إغلاق القائمة"
            >
              <X className="size-4" />
            </button>
            <button
              type="button"
              onClick={toggleCollapse}
              className="hidden lg:flex size-8 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
              title={collapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
            >
              <PanelRightClose className={`size-4 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick Sidebar Filter Input */}
        {(!collapsed || mobileMenuOpen) && (
          <div className="px-3 pt-3 pb-1">
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
              <input
                type="text"
                value={navFilter}
                onChange={(e) => setNavFilter(e.target.value)}
                placeholder="تصفية القوائم والشاشات..."
                className="w-full rounded-xl border border-slate-200/90 bg-slate-50/90 ps-8 pe-7 py-1.5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-cyan-500 focus:bg-white dark:border-slate-800 dark:bg-[#070b14]/70 dark:text-slate-100 dark:focus:border-cyan-400"
              />
              {navFilter && (
                <button
                  type="button"
                  onClick={() => setNavFilter('')}
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  title="مسح التصفية"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Grouped Navigation Links with Custom Sleek Scrollbar */}
        <nav className="flex-1 space-y-3.5 overflow-y-auto px-3 py-2.5 custom-scrollbar">
          {filteredNavGroups.length === 0 ? (
            <div className="py-8 text-center text-xs font-semibold text-slate-400">
              لا توجد شاشات مطابقة لـ «{navFilter}»
            </div>
          ) : (
            filteredNavGroups.map((group) => (
              <div key={group.key} className="space-y-1">
                {(!collapsed || mobileMenuOpen) && (
                  <div className="nav-group-label">{group.label}</div>
                )}
                {group.sections.map((s) => (
                  <Section
                    key={s.key}
                    s={s}
                    collapsed={collapsed && !mobileMenuOpen}
                    forceOpen={!!navFilter.trim()}
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
                ))}
              </div>
            ))
          )}
        </nav>

        {/* User Card at Sidebar Bottom */}
        <div className="border-t border-slate-200/80 p-3 dark:border-slate-800/80">
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/90 p-2.5 transition-colors dark:border-slate-800/90 dark:bg-[#0f172a]/90">
            <div className={`flex items-center gap-2.5 ${!collapsed || mobileMenuOpen ? 'mb-2.5' : 'justify-center'}`}>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 font-black text-sm text-slate-950 shadow-sm">
                {me?.user.fullName ? me.user.fullName[0] : 'م'}
              </div>
              {(!collapsed || mobileMenuOpen) && (
                <div className="min-w-0 flex-1 text-xs animate-fade-in">
                  <div className="font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                    {me?.user.fullName || 'المدير التنفيذي'}
                  </div>
                  <div className="text-[10.5px] font-bold text-amber-600 dark:text-amber-400 truncate mt-0.5">
                    {me?.user.username === 'admin' ? '👑 مدير المنظومة التنفيذي' : `@${me?.user.username}`}
                  </div>
                </div>
              )}
            </div>
            {(!collapsed || mobileMenuOpen) && (
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-500/20 dark:text-rose-400 transition-colors cursor-pointer"
                onClick={() => void logout()}
              >
                <LogOut className="size-3.5" />
                <span>تسجيل الخروج من النظام</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ─────────── Main Content ─────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header Bar (Dual Mode: Crisp Light / Dark Obsidian) */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b border-slate-200/90 bg-white/95 backdrop-blur-md px-3.5 sm:px-5 shadow-xs dark:border-slate-800/90 dark:bg-[#0b1120]/95">
          {/* Mobile Menu Trigger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex lg:hidden size-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            aria-label="فتح القائمة الجانبية"
          >
            <Menu className="size-4" />
          </button>

          {/* Company Switcher (only shown if user has multiple companies; never sets empty companyId) */}
          {me?.companies && me.companies.length > 1 && (
            <div className="hidden md:flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-[#0f172a]">
              <Building2 className="size-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
              <select
                className="bg-transparent text-xs font-extrabold text-slate-800 dark:text-white outline-none cursor-pointer max-w-[180px]"
                value={company?.id ?? me.companies[0].id}
                onChange={(e) => {
                  if (e.target.value) {
                    switchCompany(e.target.value);
                    qc.clear();
                  }
                }}
              >
                {me.companies.map((c) => (
                  <option key={c.id} value={c.id} className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white">
                    {c.nameAr} ({c.baseCurrency})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Active Branch Selector (Safe branch scope selector + full readable company/branch labels) */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/90 px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-[#0f172a]">
            <Globe className="size-3.5 text-amber-500 shrink-0" />
            <span className="hidden sm:inline font-bold text-slate-500 dark:text-slate-400 text-[11px]">الفرع النشط:</span>
            <select
              className="bg-transparent text-xs font-extrabold text-slate-800 dark:text-white outline-none cursor-pointer max-w-[175px] sm:max-w-[240px]"
              value={activeBranchId}
              onChange={(e) => handleBranchChange(e.target.value)}
              title={company?.nameAr || 'جميع الفروع'}
            >
              <option value="" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white">
                جميع الفروع (عرض مجمع){company?.nameAr ? ` — ${company.nameAr}` : ''}
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id} className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white">
                  {b.nameAr} ({b.functionalCurrency ?? company?.baseCurrency ?? 'SAR'})
                </option>
              ))}
            </select>
          </div>

          {/* Online Status Pill */}
          <div className="hidden xl:flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>متصل أونلاين</span>
          </div>

          {/* Dual Live Clocks: Mecca 🕋 & Cairo 🇪🇬 */}
          <div className="hidden 2xl:flex items-center gap-2.5 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-[#0f172a] dark:text-slate-300">
            <div className="flex items-center gap-1.5 font-bold">
              <span className="font-mono text-slate-900 dark:text-white font-extrabold">{meccaTime}</span>
              <span className="text-[11px]">مكة 🕋</span>
            </div>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <div className="flex items-center gap-1.5 font-bold">
              <span className="font-mono text-slate-900 dark:text-white font-extrabold">{cairoTime}</span>
              <span className="text-[11px]">القاهرة 🇪🇬</span>
            </div>
          </div>

          <div className="flex-1" />

          {/* Global Command Search Trigger (Ctrl + K) */}
          <button
            type="button"
            onClick={() => {
              setCmdOpen(true);
              setCmdQuery('');
              setCmdIndex(0);
            }}
            className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/90 hover:bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-[#0f172a] dark:text-slate-300 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
            title="البحث السريع في شاشات النظام (Ctrl+K)"
          >
            <Search className="size-3.5 text-cyan-600 dark:text-cyan-400" />
            <span className="hidden md:inline">بحث سريع...</span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              Ctrl K
            </kbd>
          </button>

          {/* Fast Command & Action Buttons */}
          <div className="flex items-center gap-1.5">
            {/* Amber Pill: + فاتورة تأجير */}
            <NavLink
              to="/sal/invoices"
              className="flex items-center gap-1 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black px-2.5 py-1.5 text-xs shadow-xs transition-all active:scale-95"
              title="إنشاء فاتورة مبيعات / تأجير جديدة"
            >
              <Plus className="size-3.5 stroke-[3]" />
              <span className="hidden sm:inline">فاتورة تأجير</span>
            </NavLink>

            {/* Emerald Pill: الخزينة والسندات */}
            <NavLink
              to="/fin/custodies"
              className="hidden md:flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1.5 text-xs shadow-xs transition-all active:scale-95"
              title="الخزينة والعهد النقدية"
            >
              <Coins className="size-3.5" />
              <span>الخزينة والسندات</span>
            </NavLink>

            {/* Teal Pill: دفتر القيود واليومية */}
            <NavLink
              to="/acc/journals"
              className="hidden lg:flex items-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-600 text-white font-bold px-2.5 py-1.5 text-xs shadow-xs transition-all active:scale-95"
              title="دفتر قيود اليومية"
            >
              <FileText className="size-3.5" />
              <span>دفتر القيود واليومية</span>
            </NavLink>

            {/* Dark Emerald Pill: شجرة الحسابات */}
            <NavLink
              to="/acc/accounts"
              className="hidden xl:flex items-center gap-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold px-2.5 py-1.5 text-xs shadow-xs transition-all active:scale-95"
              title="دليل الحسابات المحاسبية"
            >
              <BookOpen className="size-3.5" />
              <span>شجرة الحسابات</span>
            </NavLink>

            {/* Theme Toggle Pill Button */}
            <button
              type="button"
              onClick={toggle}
              className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-extrabold transition-all shadow-xs border cursor-pointer ${
                dark
                  ? 'bg-slate-800/90 text-amber-400 border-slate-700 hover:bg-slate-700'
                  : 'bg-amber-50 text-slate-800 border-amber-200 hover:bg-amber-100'
              }`}
              title={dark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'}
            >
              {dark ? (
                <>
                  <Sun className="size-3.5 text-amber-400" />
                  <span className="hidden sm:inline">الوضع النهاري</span>
                </>
              ) : (
                <>
                  <Moon className="size-3.5 text-amber-600" />
                  <span className="hidden sm:inline">الوضع الليلي</span>
                </>
              )}
            </button>

            {/* Jobs Center Queue Modal Trigger */}
            <JobsCenterButton />
          </div>
        </header>

        {/* Main Body */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-5 md:p-6">
          {/* Active Module Breadcrumb Bar on Non-Dashboard Screens */}
          {activeBreadcrumb && (
            <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2 text-xs shadow-2xs dark:border-slate-800/80 dark:bg-[#0c1427]/80">
              <div className="flex flex-wrap items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <Link
                  to="/"
                  className="inline-flex items-center gap-1 font-bold text-slate-600 hover:text-cyan-600 dark:text-slate-300 dark:hover:text-cyan-400 transition-colors"
                >
                  <LayoutDashboard className="size-3.5 text-amber-500" />
                  <span>لوحة المؤشرات</span>
                </Link>
                <ChevronLeft className="size-3.5 opacity-50" />
                <span className="font-semibold">{activeBreadcrumb.section}</span>
                {activeBreadcrumb.item && (
                  <>
                    <ChevronLeft className="size-3.5 opacity-50" />
                    <span className="font-extrabold text-cyan-700 dark:text-cyan-400">{activeBreadcrumb.item}</span>
                  </>
                )}
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[11px] font-bold text-slate-400 dark:text-slate-500">
                <span>{company?.nameAr}</span>
                <span>•</span>
                <span className="font-mono text-amber-600 dark:text-amber-400">{company?.baseCurrency || 'SAR'}</span>
              </div>
            </div>
          )}

          <ErrorBoundary>
            {children ?? <Outlet />}
          </ErrorBoundary>
        </main>
      </div>

      {/* ─────────── Global Command Palette Modal (Ctrl+K) ─────────── */}
      {cmdOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/65 p-4 pt-[10vh] backdrop-blur-xs animate-fade-in"
          onClick={() => setCmdOpen(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#0c1427] animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1 w-full bg-gradient-to-l from-amber-400 via-cyan-500 to-emerald-500" />
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800/90">
              <Command className="size-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
              <input
                ref={cmdInputRef}
                type="text"
                value={cmdQuery}
                onChange={(e) => {
                  setCmdQuery(e.target.value);
                  setCmdIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setCmdIndex((i) => Math.min(i + 1, Math.max(0, cmdMatches.length - 1)));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setCmdIndex((i) => Math.max(0, i - 1));
                  } else if (e.key === 'Enter' && cmdMatches[cmdIndex]) {
                    e.preventDefault();
                    navigate(cmdMatches[cmdIndex].to);
                    setCmdOpen(false);
                  }
                }}
                placeholder="انتقل فوراً لأي شاشة أو تقرير... (مثال: فواتير، رواتب، ميزان المراجعة، ZATCA)"
                className="flex-1 bg-transparent text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none dark:text-white"
              />
              <button
                type="button"
                onClick={() => setCmdOpen(false)}
                className="rounded-lg border border-slate-200 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                ESC
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-2 custom-scrollbar">
              {cmdMatches.length === 0 ? (
                <div className="py-10 text-center text-xs font-semibold text-slate-400">
                  لا توجد شاشات مطابقة لـ «{cmdQuery}»
                </div>
              ) : (
                cmdMatches.map((entry, idx) => {
                  const color = COLOR_CLASSES[entry.color];
                  const selected = idx === cmdIndex;
                  const Icon = entry.icon;
                  return (
                    <button
                      key={`${entry.sectionLabel}:${entry.to}`}
                      type="button"
                      onMouseEnter={() => setCmdIndex(idx)}
                      onClick={() => {
                        navigate(entry.to);
                        setCmdOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-start transition-colors cursor-pointer ${
                        selected
                          ? 'bg-amber-500/12 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${color.iconBg}`}>
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold truncate">{entry.label}</div>
                          <div className="text-[10.5px] font-medium text-slate-400 dark:text-slate-500 truncate">
                            {entry.sectionLabel} • {entry.groupLabel}
                          </div>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-slate-400 dark:text-slate-500" dir="ltr">
                        {entry.to}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[11px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-[#080d1a] dark:text-slate-400">
              <span>استخدم الأسهم ↑↓ للتنقل و Enter للفتح</span>
              <span>{ALL_SEARCH_ENTRIES.length} شاشة وتقرير في المنظومة</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
