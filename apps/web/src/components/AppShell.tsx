import { ReactNode, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  BarChart3, BookOpen, Briefcase, Building2, Calculator, Calendar, ChevronDown, Clock,
  Coins, FileText, Landmark, LayoutDashboard, LogOut, Moon, Package, PanelRightClose,
  Settings, ShieldCheck, ShoppingCart, Sun, Users, Wallet,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ErrorBoundary } from './ErrorBoundary';

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

function useTheme() {
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('idham.theme', dark ? 'dark' : 'light');
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

function Section({ s, collapsed }: { s: NavSection; collapsed?: boolean }) {
  const loc = useLocation();
  const active = s.items?.some((i) => loc.pathname === i.to || loc.pathname.startsWith(`${i.to}/`));
  const [open, setOpen] = useState(!!active);

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  const color = COLOR_CLASSES[s.color || 'blue'];
  const base =
    'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-bold transition-all duration-150';

  if (s.to) {
    return (
      <NavLink
        to={s.to}
        end
        className={({ isActive }) =>
          `${base} ${
            isActive
              ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-md shadow-brand-500/20 font-bold'
              : 'text-slate-300 hover:bg-white/10 hover:text-white'
          }`
        }
        title={collapsed ? s.label : undefined}
      >
        {({ isActive }) => (
          <>
            <div
              className={`flex size-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-150 group-hover:scale-105 ${
                isActive ? 'bg-white/20 text-white' : color.iconBg
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
            ? 'bg-brand-500/25 text-white font-bold'
            : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`}
        onClick={() => setOpen(!open)}
        title={collapsed ? s.label : undefined}
      >
        <div
          className={`flex size-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-150 group-hover:scale-105 ${
            active ? 'bg-brand-500/30 text-brand-300' : color.iconBg
          }`}
        >
          <s.icon className="size-4" />
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 whitespace-nowrap text-start text-[13px]">{s.label}</span>
            <div className="flex items-center gap-1.5">
              {s.items && (
                <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                  {s.items.length}
                </span>
              )}
              <ChevronDown
                className={`size-3.5 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              />
            </div>
          </>
        )}
      </button>

      {!collapsed && open && s.items && (
        <div className="ms-6.5 mt-1 space-y-0.5 border-s-2 border-white/15 ps-2.5">
          {s.items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end
              className={({ isActive }) =>
                `group/sub flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[12px] transition-all duration-150 ${
                  isActive
                    ? 'bg-brand-500/30 font-bold text-white shadow-xs'
                    : 'text-slate-400 hover:bg-white/10 hover:text-white font-medium'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <span
                      className={`size-1.5 rounded-full transition-transform duration-150 ${
                        isActive
                          ? 'bg-brand-400 scale-125'
                          : 'bg-slate-500 group-hover/sub:bg-slate-300'
                      }`}
                    />
                    {i.label}
                  </span>
                  {isActive && <span className="size-1 rounded-full bg-brand-400" />}
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
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('idham.sidebar.collapsed') === 'true');

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('idham.sidebar.collapsed', String(next));
      return next;
    });
  };

  return (
    <div className="flex h-full bg-slate-100 dark:bg-gray-950">
      {/* ─────────── Sidebar ─────────── */}
      <aside
        className={`flex shrink-0 flex-col border-e border-white/5 shadow-2xl transition-all duration-300 ${
          collapsed ? 'w-18' : 'w-72'
        }`}
        style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 30%, #0f172a 70%, #1a1a2e 100%)' }}
      >
        {/* Brand Logo Header */}
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4"
          style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)' }}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 via-brand-500 to-indigo-400 font-black text-white shadow-lg shadow-brand-600/40 text-lg">
              إ
            </div>
            {!collapsed && (
              <div className="leading-tight break-words animate-fade-in">
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-black tracking-tight text-white">إدهـام</span>
                  <span className="rounded-md bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-black text-brand-300 border border-brand-500/30">
                    ERP
                  </span>
                </div>
                <div className="text-[11px] font-semibold text-slate-400">
                  الموارد البشرية والمحاسبي
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={toggleCollapse}
            className="flex size-8 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            title={collapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
          >
            <PanelRightClose className={`size-4 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Grouped Navigation Links with Custom Sleek Scrollbar */}
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3.5 custom-scrollbar">
          {NAV_GROUPS.map((group) => (
            <div key={group.key} className="space-y-1">
              {!collapsed && (
                <div className="nav-group-label">
                  {group.label}
                </div>
              )}
              {group.sections.map((s) => (
                <Section key={s.key} s={s} collapsed={collapsed} />
              ))}
            </div>
          ))}
        </nav>

        {/* User Card at Sidebar Bottom */}
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2.5 rounded-xl p-2 transition-colors hover:bg-white/5"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(79,70,229,0.05) 100%)' }}>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-brand-500 to-purple-600 font-bold text-sm text-white shadow-lg shadow-brand-500/30">
              {me?.user.fullName ? me.user.fullName[0] : 'أ'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1 text-xs animate-fade-in">
                <div className="font-bold text-white leading-tight break-words">{me?.user.fullName}</div>
                <div className="text-[10px] font-semibold text-brand-400 break-words mt-0.5">
                  {me?.user.username === 'admin' ? '👑 مدير النظام التنفيذي' : `@${me?.user.username}`}
                </div>
              </div>
            )}
            {!collapsed && (
              <button
                type="button"
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/15 hover:text-rose-400 transition-colors"
                onClick={() => void logout()}
                title="تسجيل الخروج"
              >
                <LogOut className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ─────────── Main Content ─────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Dark Executive Top Bar */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-slate-300/40 bg-slate-900 px-5 shadow-lg dark:border-slate-700/40 dark:bg-gray-950">
          {/* Company Picker */}
          <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 py-1.5 hover:bg-white/12 transition-colors">
            <Building2 className="size-4 text-brand-400 shrink-0" />
            <select
              className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
              value={company?.id ?? ''}
              onChange={(e) => {
                switchCompany(e.target.value);
                qc.clear();
              }}
            >
              {me?.companies.map((c) => (
                <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                  {c.nameAr} ({c.code})
                </option>
              ))}
            </select>
            <span className="rounded-md bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-black text-brand-300 border border-brand-500/30">
              {company?.baseCurrency ?? 'EGP'}
            </span>
          </div>

          {/* Active Period Badge */}
          <div className="hidden sm:flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs">
            <Calendar className="size-3.5 text-emerald-400" />
            <span className="font-semibold text-emerald-300 text-[11px]">الفترة المالية:</span>
            <span className="font-bold text-white font-mono">FY2026-10</span>
            <span className="flex size-2 rounded-full bg-emerald-400 animate-pulse" title="فترة مفتوحة" />
          </div>

          {/* Executive Date Display */}
          <div className="hidden lg:flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
            <Clock className="size-3.5 text-brand-400" />
            <span className="font-semibold text-slate-200">
              {new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              }).format(new Date())}
            </span>
          </div>

          {/* Live Connectivity */}
          <div className="hidden md:flex items-center gap-1.5 text-[11px] font-bold text-slate-400 me-auto">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse-glow" />
            <span>النظام متصل ومتزامن</span>
          </div>

          <div className="flex-1 md:hidden" />

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
              onClick={toggle}
              title={dark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
            >
              {dark ? <Sun className="size-4.5 text-amber-400" /> : <Moon className="size-4.5" />}
            </button>

            <div className="h-5 w-px bg-white/15" />

            {/* User Profile Pill */}
            <div className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/8 px-2.5 py-1.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-tr from-brand-500 to-indigo-500 text-xs font-bold text-white shadow-xs">
                {me?.user.fullName ? me.user.fullName[0] : 'أ'}
              </div>
              <div className="text-end text-xs leading-tight hidden sm:block">
                <div className="font-bold text-white">{me?.user.fullName}</div>
                <div className="text-[10px] text-slate-400" dir="ltr">@{me?.user.username}</div>
              </div>
            </div>

            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-500/15 hover:text-rose-400 transition-colors"
              onClick={() => void logout()}
              title="تسجيل الخروج"
            >
              <LogOut className="size-4.5" />
            </button>
          </div>
        </header>

        {/* Main Body */}
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <ErrorBoundary>
            {children ?? <Outlet />}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
