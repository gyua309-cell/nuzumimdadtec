import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Banknote, BarChart3, BookOpen, Briefcase, Building2, CheckCircle2, ChevronDown, ChevronLeft,
  Cloud, Coins, Command, Contrast, Database, FileCheck2, FileText, Globe, Landmark, LayoutDashboard, Loader2, LogOut, Menu, Moon, Package,
  PanelRightClose, Plus, Search, Server, Settings, ShieldCheck, ShoppingCart, Sun, Users, Vault, Wallet, X, Zap,
  GitBranch,
  PieChart,
} from 'lucide-react';
import { api, getApiBaseUrl, getCustomApiUrl, resetApiOfflineCache, setCustomApiUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { defaultAccountsList } from '../lib/fallback-engine';
import { getEntityList } from '../lib/local-store';
import { ErrorBoundary } from './ErrorBoundary';
import { JobsCenterButton } from './JobsCenterModal';
import { RoyalPrintPreviewModal } from './RoyalPrintPreviewModal';
import { CURRENT_BUILD_ID, checkLiveBuildFreshness } from '../lib/build-freshness';
import { Modal } from './ui';

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
  step?: string;
  badge?: string;
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

const SIDEBAR_ICON_DARK_TINT: Record<SectionColor, string> = {
  blue: 'bg-sky-500/14 text-sky-400',
  amber: 'bg-amber-500/14 text-amber-400',
  emerald: 'bg-emerald-500/14 text-emerald-400',
  indigo: 'bg-indigo-500/16 text-indigo-300',
  cyan: 'bg-cyan-500/14 text-cyan-400',
  teal: 'bg-teal-500/14 text-teal-400',
  violet: 'bg-violet-500/14 text-violet-400',
  green: 'bg-emerald-500/14 text-emerald-400',
  rose: 'bg-rose-500/14 text-rose-400',
  purple: 'bg-purple-500/14 text-purple-400',
  slate: 'bg-slate-400/14 text-slate-300',
  zinc: 'bg-zinc-400/14 text-zinc-300',
};

const SIDEBAR_ICON_LIGHT_TINT: Record<SectionColor, string> = {
  blue: 'bg-sky-50 text-sky-600 dark:bg-sky-500/14 dark:text-sky-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/14 dark:text-amber-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/14 dark:text-emerald-400',
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/16 dark:text-indigo-300',
  cyan: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/14 dark:text-cyan-400',
  teal: 'bg-teal-50 text-teal-600 dark:bg-teal-500/14 dark:text-teal-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/14 dark:text-violet-400',
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/14 dark:text-emerald-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/14 dark:text-rose-400',
  purple: 'bg-purple-50 text-purple-600 dark:bg-purple-500/14 dark:text-purple-400',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-400/14 dark:text-slate-300',
  zinc: 'bg-slate-100 text-slate-600 dark:bg-zinc-400/14 dark:text-zinc-300',
};

export const PINNED_FAVORITES: Array<{
  label: string;
  path: string;
  icon: any;
  color: string;
}> = [
  { label: 'الأتمتة والقيود', path: '/automation/hub', icon: Zap, color: 'text-amber-500' },
  { label: 'الخزينة والبنوك', path: '/treasury/hub', icon: Vault, color: 'text-emerald-500' },
  { label: 'سندات القبض', path: '/treasury/receipts', icon: ArrowDownCircle, color: 'text-teal-500' },
  { label: 'سندات الصرف', path: '/treasury/payments', icon: ArrowUpCircle, color: 'text-rose-500' },
  { label: 'حافظة الشيكات', path: '/treasury/cheques', icon: FileCheck2, color: 'text-purple-500' },
  { label: 'الموظفون', path: '/hr/employees', icon: Users, color: 'text-indigo-500' },
  { label: 'المشاريع', path: '/prj/projects', icon: Briefcase, color: 'text-sky-500' },
  { label: 'الفواتير', path: '/sal/invoices', icon: FileText, color: 'text-emerald-500' },
  { label: 'شجرة الحسابات', path: '/acc/accounts', icon: BookOpen, color: 'text-violet-500' },
  { label: 'قيود اليومية', path: '/acc/journals', icon: Landmark, color: 'text-cyan-500' },
  { label: 'مراكز التكلفة', path: '/reports/cost-centers', icon: GitBranch, color: 'text-indigo-500' },
  { label: 'التقارير الموحدة', path: '/reports/hub', icon: PieChart, color: 'text-emerald-500' },
];

type SidebarDomainKey = 'ALL' | 'workforce' | 'treasury' | 'commercial' | 'finance' | 'settings';

const SIDEBAR_DOMAINS: Array<{ key: SidebarDomainKey; label: string }> = [
  { key: 'ALL', label: 'الكل' },
  { key: 'workforce', label: 'الكوادر' },
  { key: 'treasury', label: 'الخزينة' },
  { key: 'commercial', label: 'التجاري' },
  { key: 'finance', label: 'المالية' },
  { key: 'settings', label: 'الإعدادات' },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'overview',
    label: 'القيادة والأتمتة',
    sections: [
      { key: 'dash', label: 'لوحة المؤشرات التنفيذية', icon: LayoutDashboard, to: '/', color: 'indigo' },
      { key: 'auto_hub', label: 'مركز الأتمتة والقيود الآلية', icon: Zap, to: '/automation/hub', color: 'amber', badge: 'آلي' },
    ],
  },
  {
    key: 'workforce',
    label: 'الكوادر والمشاريع والرواتب',
    sections: [
      {
        key: 'hr',
        label: 'الموارد البشرية والتكلفة',
        icon: Users,
        color: 'emerald',
        items: [
          { to: '/hr/operating-cycle', label: 'دورة التشغيل والأسئلة الـ 10' },
          { to: '/hr/employees', label: 'سجل الموظفين' },
          { to: '/hr/positions', label: 'الهيكل الوظيفي' },
          { to: '/cost/sheet', label: 'كشف تكلفة الكوادر' },
          { to: '/cost/components', label: 'بنود التكلفة' },
          { to: '/cost/profiles', label: 'ملفات التكلفة' },
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
          { to: '/services/catalog', label: 'دليل الخدمات والأسعار' },
          { to: '/prj/employee-tracking', label: 'كروت تتبع الموظفين' },
          { to: '/prj/assignments', label: 'تخصيص الموظفين' },
          { to: '/prj/allocation-days', label: 'توزيع الأيام والنسب' },
          { to: '/prj/utilization', label: 'معدل استغلال الكوادر' },
          { to: '/prj/prices', label: 'أسعار الخدمات' },
        ],
      },
      {
        key: 'pay',
        label: 'الرواتب والمستحقات',
        icon: Wallet,
        color: 'violet',
        items: [
          { to: '/pay/runs', label: 'مسيّر الرواتب' },
          { to: '/pay/eosb', label: 'مكافأة نهاية الخدمة' },
          { to: '/pay/variables', label: 'البدلات والخصومات' },
          { to: '/pay/loans', label: 'سلف الموظفين' },
          { to: '/pay/variable-types', label: 'أنواع البدلات' },
        ],
      },
    ],
  },
  {
    key: 'treasury',
    label: 'الخزينة والبنوك والشيكات',
    sections: [
      { key: 'tr_hub', label: 'لوحة الخزينة والسيولة', icon: Vault, to: '/treasury/hub', color: 'emerald', badge: 'حي' },
      { key: 'tr_banks', label: 'البنوك والتحويلات', icon: Landmark, to: '/treasury/banks', color: 'blue' },
      { key: 'tr_cash', label: 'الخزائن والصناديق النقدية', icon: Coins, to: '/treasury/cashboxes', color: 'amber' },
      { key: 'tr_rec', label: 'سندات القبض', icon: ArrowDownCircle, to: '/treasury/receipts', color: 'teal' },
      { key: 'tr_pay', label: 'سندات الصرف', icon: ArrowUpCircle, to: '/treasury/payments', color: 'rose' },
      { key: 'tr_chq', label: 'حافظة الشيكات', icon: FileCheck2, to: '/treasury/cheques', color: 'purple' },
      { key: 'fin', label: 'العهد النقدية للموظفين', icon: Banknote, to: '/fin/custodies', color: 'cyan' },
    ],
  },
  {
    key: 'commercial',
    label: 'المبيعات والمشتريات والأصول',
    sections: [
      {
        key: 'sal',
        label: 'المبيعات والفوترة',
        icon: FileText,
        color: 'emerald',
        items: [
          { to: '/sal/invoices', label: 'فواتير المبيعات' },
          { to: '/sal/credit-notes', label: 'إشعارات دائنة' },
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
    ],
  },
  {
    key: 'finance',
    label: 'المالية والزكاة والتقارير',
    sections: [
      {
        key: 'acc',
        label: 'المحاسبة العامة',
        icon: BookOpen,
        color: 'blue',
        items: [
          { to: '/acc/accounts', label: 'شجرة الحسابات' },
          { to: '/acc/journals', label: 'قيود اليومية' },
          { to: '/acc/journals/new', label: 'سند قيد جديد' },
          { to: '/acc/posting-rules', label: 'قواعد الترحيل' },
          { to: '/closing', label: 'إقفال الفترات' },
        ],
      },
      {
        key: 'zatca_main',
        label: 'الفوترة الإلكترونية (ZATCA)',
        icon: ShieldCheck,
        color: 'emerald',
        badge: 'Phase 2',
        items: [
          { to: '/zatca/hub', label: 'لوحة التحكم ومؤشرات الامتثال' },
          { to: '/zatca/settings', label: 'إعدادات المنشأة وأجهزة EGS' },
          { to: '/zatca/onboarding', label: 'معالج الربط والشهادات (7 خطوات)' },
          { to: '/zatca/invoices', label: 'الفواتير الإلكترونية وسجل العمليات' },
          { to: '/zatca/reports', label: 'تقارير الفوترة الإلكترونية' },
          { to: '/zatca/qr-validator', label: 'فاحص ومفسر الرمز (QR)' },
          { to: '/reports/zakat', label: 'إقرار الزكاة الشرعية والدخل' },
          { to: '/reports/vat-return', label: 'إقرار ضريبة القيمة المضافة 15%' },
        ],
      },
      {
        key: 'stmts',
        label: 'القوائم المالية',
        icon: Landmark,
        color: 'indigo',
        items: [
          { to: '/reports/trial-balance', label: 'ميزان المراجعة' },
          { to: '/reports/income-statement', label: 'قائمة الدخل' },
          { to: '/reports/balance-sheet', label: 'الميزانية العمومية' },
          { to: '/reports/cash-flow', label: 'التدفقات النقدية' },
          { to: '/reports/equity-changes', label: 'التغيرات في حقوق الملكية' },
          { to: '/reports/account-statement', label: 'كشف الحساب' },
          { to: '/acc/accounts?tab=mapping', label: 'ربط الحسابات بالقوائم' },
        ],
      },
      {
        key: 'analytics',
        label: 'التقارير التحليلية',
        icon: BarChart3,
        color: 'purple',
        items: [
          { to: '/reports/hub', label: 'مركز التقارير الموحد' },
          { to: '/reports/cost-centers', label: 'مراكز التكلفة والموظفين' },
          { to: '/reports/executive-intelligence', label: 'الرقابة والذكاء المالي' },
          { to: '/reports/employee-profitability', label: 'ربحية الكوادر' },
          { to: '/rev/profitability', label: 'ربحية المشاريع' },
          { to: '/rev/revenue', label: 'تحليل الإيرادات' },
          { to: '/reports/ar-aging', label: 'أعمار ديون العملاء' },
          { to: '/reports/custody-movement', label: 'حركة وتسوية العهد' },
          { to: '/reports/multi-currency-payroll', label: 'رواتب العملات (SAR/EGP)' },
          { to: '/closing/snapshots', label: 'لقطات الإقفال' },
          { to: '/audit/log', label: 'سجل التدقيق' },
        ],
      },
    ],
  },
  {
    key: 'settings',
    label: 'الإعدادات والحوكمة',
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
        label: 'الأمان والصلاحيات',
        icon: Settings,
        color: 'zinc',
        items: [
          { to: '/settings/users', label: 'إدارة المستخدمين' },
          { to: '/settings/roles', label: 'الأدوار والصلاحيات' },
          { to: '/audit/security', label: 'سجل الأمان' },
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
  isExpanded,
  darkSidebar,
  onToggle,
  onExpandFromCollapsed,
  onNavigate,
}: {
  s: NavSection;
  collapsed?: boolean;
  isExpanded: boolean;
  darkSidebar: boolean;
  onToggle: (key: string) => void;
  onExpandFromCollapsed: (key: string) => void;
  onNavigate?: () => void;
}) {
  const loc = useLocation();
  const active = s.items?.some((i) => loc.pathname === i.to || loc.pathname.startsWith(`${i.to}/`));
  const iconTint = darkSidebar
    ? SIDEBAR_ICON_DARK_TINT[s.color || 'indigo']
    : SIDEBAR_ICON_LIGHT_TINT[s.color || 'indigo'];

  const base =
    'group relative flex min-h-[38px] w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-bold transition-all duration-150 cursor-pointer';

  if (s.to) {
    return (
      <NavLink
        to={s.to}
        end
        onClick={onNavigate}
        className={({ isActive }) =>
          `${base} ${collapsed ? 'justify-center px-0' : ''} ${
            isActive
              ? darkSidebar
                ? 'bg-gradient-to-l from-indigo-600/35 to-sky-500/18 text-white font-extrabold ring-1 ring-indigo-400/45 shadow-sm'
                : 'bg-indigo-50 text-indigo-800 font-extrabold ring-1 ring-indigo-500/25 shadow-2xs dark:bg-indigo-500/22 dark:text-white dark:ring-indigo-400/35'
              : darkSidebar
                ? 'text-slate-100 hover:bg-white/[0.08] hover:text-white'
                : 'text-slate-900 hover:bg-slate-200/60 hover:text-indigo-900 dark:text-slate-100 dark:hover:bg-white/[0.08] dark:hover:text-white'
          }`
        }
        title={collapsed ? s.label : undefined}
      >
        {({ isActive }) => (
          <>
            {isActive && !collapsed && (
              <span
                className={`pointer-events-none absolute inset-y-2 start-0 w-[3.5px] rounded-e-full ${
                  darkSidebar
                    ? 'bg-gradient-to-b from-amber-300 via-sky-300 to-indigo-400'
                    : 'bg-gradient-to-b from-indigo-600 to-sky-500 dark:from-indigo-400 dark:to-sky-400'
                }`}
              />
            )}
            <div
              className={`flex size-7.5 shrink-0 items-center justify-center rounded-lg transition-all duration-150 group-hover:scale-105 ${
                isActive
                  ? darkSidebar
                    ? 'bg-indigo-500 text-white shadow-sm shadow-indigo-950/50'
                    : 'bg-indigo-600 text-white shadow-xs shadow-indigo-600/25 dark:bg-indigo-500'
                  : iconTint
              }`}
            >
              <s.icon className="size-4" />
            </div>
            {!collapsed && (
              <>
                <span className={`flex-1 min-w-0 truncate text-start text-[13px] leading-snug ${isActive ? 'font-extrabold' : 'font-bold'}`}>{s.label}</span>
                {s.badge && (
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black leading-none ${
                      isActive
                        ? darkSidebar
                          ? 'bg-amber-400/25 text-amber-200'
                          : 'bg-indigo-600/15 text-indigo-800 dark:bg-indigo-400/25 dark:text-indigo-100'
                        : darkSidebar
                          ? 'bg-amber-400/18 text-amber-300'
                          : 'bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                    }`}
                  >
                    {s.badge}
                  </span>
                )}
              </>
            )}
          </>
        )}
      </NavLink>
    );
  }

  return (
    <div>
      <button
        type="button"
        className={`${base} ${collapsed ? 'justify-center px-0' : ''} ${
          active
            ? darkSidebar
              ? 'bg-white/[0.1] text-white font-extrabold ring-1 ring-white/15'
              : 'bg-indigo-50/90 text-indigo-800 font-extrabold ring-1 ring-indigo-500/20 dark:bg-indigo-500/20 dark:text-white dark:ring-indigo-400/30'
            : darkSidebar
              ? 'text-slate-100 hover:bg-white/[0.08] hover:text-white'
              : 'text-slate-900 hover:bg-slate-200/60 hover:text-indigo-900 dark:text-slate-100 dark:hover:bg-white/[0.08] dark:hover:text-white'
        }`}
        onClick={() => (collapsed ? onExpandFromCollapsed(s.key) : onToggle(s.key))}
        title={collapsed ? s.label : undefined}
      >
        {active && !collapsed && (
          <span
            className={`pointer-events-none absolute inset-y-2 start-0 w-[3.5px] rounded-e-full ${
              darkSidebar
                ? 'bg-sky-400'
                : 'bg-indigo-600 dark:bg-indigo-400'
            }`}
          />
        )}
        <div
          className={`flex size-7.5 shrink-0 items-center justify-center rounded-lg transition-all duration-150 group-hover:scale-105 ${
            active
              ? darkSidebar
                ? 'bg-indigo-500/35 text-indigo-100'
                : 'bg-indigo-600/15 text-indigo-700 dark:bg-indigo-500/25 dark:text-indigo-200'
              : iconTint
          }`}
        >
          <s.icon className="size-4" />
        </div>
        {!collapsed && (
          <>
            <span className={`flex-1 min-w-0 truncate text-start text-[13px] leading-snug ${active ? 'font-extrabold' : 'font-bold'}`}>{s.label}</span>
            {s.badge && (
              <span
                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black leading-none ${
                  darkSidebar
                    ? 'bg-emerald-400/18 text-emerald-300 border border-emerald-400/30'
                    : 'bg-emerald-500/12 text-emerald-700 border border-emerald-500/25'
                }`}
              >
                {s.badge}
              </span>
            )}
            <ChevronDown
              className={`size-4 shrink-0 transition-transform duration-200 ${
                isExpanded
                  ? darkSidebar
                    ? 'rotate-180 text-sky-300'
                    : 'rotate-180 text-indigo-700 dark:text-indigo-300'
                  : darkSidebar
                    ? 'text-slate-400'
                    : 'text-slate-600 dark:text-slate-400'
              }`}
            />
          </>
        )}
      </button>

      {!collapsed && isExpanded && s.items && (
        <div
          className={`ms-[20px] mt-1 mb-1.5 space-y-0.5 border-s-[2px] ps-2.5 ${
            darkSidebar ? 'border-indigo-400/25' : 'border-slate-300/90 dark:border-slate-700'
          }`}
        >
          {s.items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end
              onClick={onNavigate}
              className={({ isActive }) =>
                `group/sub flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] leading-snug transition-all duration-150 ${
                  isActive
                    ? darkSidebar
                      ? 'bg-indigo-500/28 font-extrabold text-white'
                      : 'bg-indigo-50 font-extrabold text-indigo-800 dark:bg-indigo-500/25 dark:text-white'
                    : darkSidebar
                      ? 'text-slate-200 hover:bg-white/[0.08] hover:text-white font-bold'
                      : 'text-slate-700 hover:bg-slate-200/60 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/[0.08] dark:hover:text-white font-bold'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`shrink-0 rounded-full transition-all duration-150 ${
                      isActive
                        ? darkSidebar
                          ? 'h-3.5 w-1 bg-amber-300'
                          : 'h-3.5 w-1 bg-indigo-600 dark:bg-indigo-400'
                        : darkSidebar
                          ? 'size-1.5 bg-slate-500 group-hover/sub:bg-sky-300'
                          : 'size-1.5 bg-slate-400 dark:bg-slate-500 group-hover/sub:bg-indigo-600'
                    }`}
                  />
                  <span className="flex-1 min-w-0 whitespace-normal">{i.label}</span>
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
  const [darkSidebarPref, setDarkSidebarPref] = useState(() => localStorage.getItem('idham.sidebar.theme') !== 'light');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDomain, setActiveDomain] = useState<SidebarDomainKey>('ALL');
  const [navFilter, setNavFilter] = useState('');
  const [openSectionKey, setOpenSectionKey] = useState<string | null>(() => {
    for (const g of NAV_GROUPS) {
      for (const s of g.sections) {
        if (s.items?.some((i) => window.location.hash.includes(i.to) || window.location.pathname === i.to)) {
          return s.key;
        }
      }
    }
    return null;
  });
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [cmdIndex, setCmdIndex] = useState(0);
  const cmdInputRef = useRef<HTMLInputElement>(null);

  const toggleSidebarStyle = () => {
    setDarkSidebarPref((prev) => {
      const next = !prev;
      localStorage.setItem('idham.sidebar.theme', next ? 'navy' : 'light');
      return next;
    });
  };

  // Auto-open active route's accordion section on navigation
  useEffect(() => {
    for (const g of NAV_GROUPS) {
      for (const s of g.sections) {
        if (s.items?.some((i) => loc.pathname === i.to || loc.pathname.startsWith(`${i.to}/`))) {
          setOpenSectionKey(s.key);
          return;
        }
      }
    }
  }, [loc.pathname]);

  // Cloud Database Sync Modal State
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [cloudUrlInput, setCloudUrlInput] = useState(() => getCustomApiUrl());
  const isCloudConfigured = !!getCustomApiUrl();
  const [testingPing, setTestingPing] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; latencyMs?: number; message?: string } | null>(null);

  const handleTestCloudPing = async () => {
    resetApiOfflineCache();
    setTestingPing(true);
    setPingResult(null);
    const start = Date.now();
    const targetUrl = cloudUrlInput.trim() || getApiBaseUrl();
    try {
      const clean = targetUrl.replace(/\/$/, '');
      const res = await fetch(`${clean}/health`, { method: 'GET', signal: AbortSignal.timeout(4000) });
      const elapsed = Date.now() - start;
      if (res.ok) {
        setPingResult({ ok: true, latencyMs: elapsed, message: `متصل بنجاح بالسيرفر السحابي! سرعة الاستجابة: ${elapsed}ms` });
      } else {
        setPingResult({ ok: false, latencyMs: elapsed, message: `استجاب السيرفر برمز ${res.status}` });
      }
    } catch {
      setPingResult({ ok: false, message: 'تعذر الاتصال بالسيرفر. تأكد من تشغيل السيرفر أو الرابط وإتاحة CORS.' });
    } finally {
      setTestingPing(false);
    }
  };

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
    if (raw && Array.isArray(raw.data)) return raw.data;
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

  // Cloud build staleness protection (GitHub Pages CDN / cached tabs)
  useEffect(() => {
    void checkLiveBuildFreshness();
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('idham.sidebar.collapsed', String(next));
      return next;
    });
  };

  // Filtered sidebar groups (respects both search query and active domain pill)
  const filteredNavGroups = useMemo(() => {
    const q = navFilter.trim().toLowerCase();
    const baseGroups =
      activeDomain === 'ALL'
        ? NAV_GROUPS
        : NAV_GROUPS.filter((g) => g.key === activeDomain);

    if (!q) return baseGroups;
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
  }, [navFilter, activeDomain]);

  // Command palette matches (Screens + Live Entities: Employees, Projects, Invoices, Journals, Accounts)
  const cmdMatches = useMemo(() => {
    const quickActions = [
      { label: '⚡ مركز الأتمتة الشاملة والترحيل الذكي', sectionLabel: 'إجراء سريع', groupLabel: 'الأتمتة والربط', to: '/automation/hub', icon: Zap, color: 'indigo' as SectionColor },
      { label: '💰 لوحة الخزينة والبنوك والشيكات', sectionLabel: 'إجراء سريع', groupLabel: 'الخزينة والبنوك', to: '/treasury/hub', icon: Vault, color: 'emerald' as SectionColor },
      { label: '➕ سند قبض مالي جديد', sectionLabel: 'إجراء سريع', groupLabel: 'الخزينة والبنوك', to: '/treasury/receipts', icon: ArrowDownCircle, color: 'teal' as SectionColor },
      { label: '➕ سند صرف (موظف / مورد / مصروف)', sectionLabel: 'إجراء سريع', groupLabel: 'الخزينة والبنوك', to: '/treasury/payments', icon: ArrowUpCircle, color: 'rose' as SectionColor },
      { label: '🧾 حافظة الشيكات (أوراق قبض ودفع)', sectionLabel: 'إجراء سريع', groupLabel: 'الخزينة والبنوك', to: '/treasury/cheques', icon: FileCheck2, color: 'purple' as SectionColor },
      { label: '➕ تعيين موظف جديد (مركز تكلفة)', sectionLabel: 'إجراء سريع', groupLabel: 'الموارد البشرية', to: '/hr/employees', icon: Users, color: 'blue' as SectionColor },
      { label: '➕ إنشاء فاتورة مبيعات ضريبية', sectionLabel: 'إجراء سريع', groupLabel: 'المبيعات والفوترة', to: '/sal/invoices', icon: FileText, color: 'emerald' as SectionColor },
      { label: '➕ قيد يومية محاسبي جديد', sectionLabel: 'إجراء سريع', groupLabel: 'المحاسبة العامة', to: '/acc/journals/new', icon: BookOpen, color: 'sky' as any },
    ].map((x) => ({ ...x, color: (COLOR_CLASSES[x.color as SectionColor] ? x.color : 'indigo') as SectionColor }));

    const q = cmdQuery.trim().toLowerCase();
    if (!q) {
      return [...quickActions, ...ALL_SEARCH_ENTRIES.slice(0, 12)];
    }

    const screenMatches = ALL_SEARCH_ENTRIES.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.sectionLabel.toLowerCase().includes(q) ||
        e.groupLabel.toLowerCase().includes(q) ||
        e.to.toLowerCase().includes(q),
    );

    const liveEntities: typeof ALL_SEARCH_ENTRIES = [];
    if (cmdOpen) {
      const emps = getEntityList<any>('employees', []);
      for (const e of emps) {
        const hay = `${e.code || ''} ${e.fullNameAr || ''} ${e.fullNameEn || ''} ${e.positionTitle || ''}`.toLowerCase();
        if (hay.includes(q)) {
          liveEntities.push({
            label: `👤 ${e.code || ''} — ${e.fullNameAr || e.fullNameEn || 'موظف'}`,
            sectionLabel: e.positionTitle || 'ملف موظف',
            groupLabel: 'سجل الكوادر الحية',
            to: `/hr/employees/${e.id}`,
            icon: Users,
            color: 'blue',
          });
        }
      }

      const prjs = getEntityList<any>('projects', []);
      for (const p of prjs) {
        const hay = `${p.code || ''} ${p.nameAr || ''} ${p.nameEn || ''} ${p.clientName || ''}`.toLowerCase();
        if (hay.includes(q)) {
          liveEntities.push({
            label: `💼 ${p.code || ''} — ${p.nameAr || 'مشروع'}`,
            sectionLabel: p.clientName || 'بطاقة مشروع 360°',
            groupLabel: 'المشاريع التعاقدية',
            to: `/prj/projects/${p.id}`,
            icon: Briefcase,
            color: 'indigo',
          });
        }
      }

      const invs = getEntityList<any>('invoices', []);
      for (const inv of invs) {
        const hay = `${inv.invoiceNo || ''} ${inv.clientName || ''} ${inv.projectName || ''}`.toLowerCase();
        if (hay.includes(q)) {
          liveEntities.push({
            label: `🧾 فاتورة ${inv.invoiceNo} — ${inv.clientName || ''}`,
            sectionLabel: `${inv.totalAmount || '0.00'} ${inv.currencyCode || 'SAR'}`,
            groupLabel: 'فواتير المبيعات',
            to: `/sal/invoices/${inv.id}`,
            icon: FileText,
            color: 'emerald',
          });
        }
      }

      const jes = getEntityList<any>('journal_entries', []);
      for (const je of jes) {
        const hay = `${je.entryNo || ''} ${je.description || ''} ${je.reference || ''}`.toLowerCase();
        if (hay.includes(q)) {
          liveEntities.push({
            label: `📘 قيد ${je.entryNo || je.id} — ${je.description || ''}`,
            sectionLabel: `مدين/دائن: ${je.totalDebitBase || '0.00'} SAR`,
            groupLabel: 'دفتر اليومية العام',
            to: `/acc/journals/${je.id}`,
            icon: BookOpen,
            color: 'violet',
          });
        }
      }

      const accs = getEntityList<any>('accounts', defaultAccountsList);
      for (const acc of accs) {
        const hay = `${acc.code || ''} ${acc.nameAr || ''}`.toLowerCase();
        if (hay.includes(q)) {
          liveEntities.push({
            label: `🏦 حساب ${acc.code} — ${acc.nameAr}`,
            sectionLabel: 'كشف حساب الأستاذ العام',
            groupLabel: 'شجرة الحسابات',
            to: `/reports/account-statement?accountId=${acc.id}`,
            icon: Landmark,
            color: 'teal',
          });
        }
      }
    }

    return [...liveEntities.slice(0, 10), ...screenMatches].slice(0, 20);
  }, [cmdQuery, cmdOpen]);

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
    <div className="flex h-full w-full max-w-full overflow-hidden bg-transparent text-slate-800 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ─────────── Re-Engineered Executive Royal Navy / Light Sidebar ─────────── */}
      <aside
        className={`fixed inset-y-0 start-0 z-40 flex shrink-0 flex-col transition-all duration-300 lg:relative lg:z-auto ${
          darkSidebarPref
            ? 'border-e border-indigo-950/90 bg-gradient-to-b from-[#0b1326] via-[#0f1a33] to-[#080f1f] text-slate-100 shadow-2xl shadow-slate-950/40'
            : 'border-e border-slate-200/95 bg-[#f8fafc] text-slate-800 shadow-[4px_0_24px_-12px_rgba(15,23,42,0.08)] dark:border-slate-800/85 dark:bg-[#080e1f] dark:text-slate-100 dark:shadow-2xl'
        } ${
          mobileMenuOpen ? 'translate-x-0 w-[288px]' : 'max-lg:translate-x-full'
        } ${collapsed ? 'lg:w-[74px]' : 'lg:w-[286px]'}`}
      >
        {/* Top Luminous Accent Hairline */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-l from-indigo-600 via-sky-500 to-emerald-500 opacity-90" />

        {/* Brand Logo Header */}
        <div
          className={`relative flex h-16 shrink-0 items-center justify-between border-b px-3 ${
            darkSidebarPref
              ? 'border-white/[0.08] bg-[#070d1d]/80'
              : 'border-slate-200/80 bg-gradient-to-l from-white via-white to-indigo-50/40 dark:border-slate-800/85 dark:from-[#080e1f] dark:to-[#0c142a]'
          }`}
        >
          <Link to="/" className={`flex min-w-0 items-center gap-2.5 group ${collapsed && !mobileMenuOpen ? 'mx-auto' : ''}`}>
            <div className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-sky-500 text-white shadow-md shadow-indigo-600/30 ring-1 ring-white/25 transition-transform duration-200 group-hover:scale-105">
              <Landmark className="size-4.5" />
              <span
                className={`absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ${
                  darkSidebarPref ? 'ring-[#070d1d]' : 'ring-white dark:ring-[#080e1f]'
                }`}
              />
            </div>
            {(!collapsed || mobileMenuOpen) && (
              <div className="min-w-0 leading-tight animate-fade-in">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[15px] font-black tracking-tight ${
                      darkSidebarPref ? 'text-white' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    IDHAM ERP
                  </span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-black border ${
                      darkSidebarPref
                        ? 'bg-amber-400/20 text-amber-300 border-amber-400/35'
                        : 'bg-indigo-600/10 text-indigo-700 border-indigo-500/25 dark:bg-amber-400/15 dark:text-amber-300 dark:border-amber-400/30'
                    }`}
                  >
                    PRO
                  </span>
                </div>
                <div
                  className={`text-[11px] font-bold leading-snug mt-0.5 ${
                    darkSidebarPref ? 'text-slate-300' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  الموارد البشرية والمحاسبة
                </div>
              </div>
            )}
          </Link>

          {(!collapsed || mobileMenuOpen) && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={toggleSidebarStyle}
                className={`hidden lg:flex size-7.5 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  darkSidebarPref
                    ? 'text-slate-400 hover:bg-white/10 hover:text-amber-300'
                    : 'text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-white/10 dark:hover:text-amber-300'
                }`}
                title={darkSidebarPref ? 'تبديل القائمة للمظهر المتناغم مع الصفحة' : 'تبديل القائمة للون الكحلي الداكن'}
              >
                <Contrast className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex lg:hidden size-7.5 items-center justify-center rounded-lg ${
                  darkSidebarPref ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10'
                }`}
                aria-label="إغلاق القائمة"
              >
                <X className="size-4" />
              </button>
              <button
                type="button"
                onClick={toggleCollapse}
                className={`hidden lg:flex size-7.5 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  darkSidebarPref
                    ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white'
                }`}
                title="طي القائمة الجانبية"
              >
                <PanelRightClose className="size-4" />
              </button>
            </div>
          )}
        </div>

        {/* Expand Button when Collapsed */}
        {collapsed && !mobileMenuOpen && (
          <div className="hidden lg:flex justify-center pt-2.5 pb-1">
            <button
              type="button"
              onClick={toggleCollapse}
              className={`flex size-8 items-center justify-center rounded-xl transition-colors cursor-pointer ${
                darkSidebarPref
                  ? 'bg-white/[0.06] text-slate-300 hover:bg-white/15 hover:text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/12'
              }`}
              title="توسيع القائمة الجانبية"
            >
              <PanelRightClose className="size-4 rotate-180" />
            </button>
          </div>
        )}

        {/* Compact Filter Input + 5-Domain Workspace Switcher */}
        {(!collapsed || mobileMenuOpen) && (
          <div
            className={`px-3 pt-2.5 pb-2 space-y-2 border-b ${
              darkSidebarPref ? 'border-white/[0.07]' : 'border-slate-100 dark:border-slate-800/80'
            }`}
          >
            {/* Compact Filter Input */}
            <div className="relative">
              <Search
                className={`pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 ${
                  darkSidebarPref ? 'text-slate-300' : 'text-slate-600 dark:text-slate-400'
                }`}
              />
              <input
                type="text"
                value={navFilter}
                onChange={(e) => setNavFilter(e.target.value)}
                placeholder="تصفية سريعة للقوائم..."
                className={`w-full rounded-xl border ps-8 pe-7 py-1.5 text-xs font-bold outline-none transition-all ${
                  darkSidebarPref
                    ? 'border-white/15 bg-white/[0.08] text-white placeholder:text-slate-300 focus:border-indigo-400/80 focus:bg-white/[0.12]'
                    : 'border-slate-300/90 bg-slate-50 text-slate-950 placeholder:text-slate-600 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-700 dark:bg-slate-900/85 dark:text-white dark:placeholder:text-slate-400 dark:focus:border-indigo-500'
                }`}
              />
              {navFilter && (
                <button
                  type="button"
                  onClick={() => setNavFilter('')}
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                  title="مسح التصفية"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            {/* 6-Domain Workspace Grid Bar (Balanced 2x3 Symmetrical Grid — Zero Overflow) */}
            <div
              className={`grid grid-cols-3 gap-1 rounded-xl p-1 text-[11px] font-bold ${
                darkSidebarPref
                  ? 'bg-white/[0.06] border border-white/[0.08]'
                  : 'bg-slate-200/70 border border-slate-300/60 dark:bg-slate-900/90 dark:border-slate-800'
              }`}
            >
              {SIDEBAR_DOMAINS.map((dom) => {
                const isSelected = activeDomain === dom.key;
                return (
                  <button
                    key={dom.key}
                    type="button"
                    onClick={() => {
                      setActiveDomain(dom.key);
                      setNavFilter('');
                    }}
                    className={`rounded-lg px-1.5 py-1.5 text-center transition-all cursor-pointer truncate ${
                      isSelected
                        ? darkSidebarPref
                          ? 'bg-indigo-600 text-white font-extrabold shadow-xs'
                          : 'bg-white text-indigo-800 font-extrabold shadow-xs ring-1 ring-indigo-200/90 dark:bg-indigo-600 dark:text-white dark:ring-0'
                        : darkSidebarPref
                          ? 'text-slate-200 hover:text-white hover:bg-white/[0.06]'
                          : 'text-slate-700 hover:text-slate-950 hover:bg-white/60 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    {dom.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Grouped Navigation Links with Exclusive Accordion & Custom Sleek Scrollbar */}
        <nav className="relative flex-1 space-y-3.5 overflow-y-auto px-2.5 py-2.5 custom-scrollbar">
          {filteredNavGroups.length === 0 ? (
            <div className="py-8 text-center text-xs font-bold text-slate-400">
              لا توجد شاشات مطابقة لـ «{navFilter}»
            </div>
          ) : (
            filteredNavGroups.map((group) => (
              <div key={group.key} className="space-y-1">
                {(!collapsed || mobileMenuOpen) && (
                  <div className="flex items-center gap-2 px-2 pt-2 pb-1">
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${
                        darkSidebarPref ? 'bg-sky-400' : 'bg-indigo-600 dark:bg-sky-400'
                      }`}
                    />
                    <span
                      className={`text-[11.5px] font-extrabold tracking-normal whitespace-nowrap ${
                        darkSidebarPref ? 'text-sky-300/95' : 'text-indigo-900 dark:text-sky-300'
                      }`}
                    >
                      {group.label}
                    </span>
                    <span
                      className={`h-px flex-1 ${
                        darkSidebarPref
                          ? 'bg-gradient-to-l from-sky-400/25 to-transparent'
                          : 'bg-gradient-to-l from-slate-300/90 to-transparent dark:from-slate-700'
                      }`}
                    />
                  </div>
                )}
                {group.sections.map((s) => {
                  const forceOpen = !!navFilter.trim() || activeDomain !== 'ALL';
                  const isExpanded = forceOpen || openSectionKey === s.key;
                  return (
                    <Section
                      key={s.key}
                      s={s}
                      collapsed={collapsed && !mobileMenuOpen}
                      isExpanded={isExpanded}
                      darkSidebar={darkSidebarPref}
                      onToggle={(k) => setOpenSectionKey((prev) => (prev === k ? null : k))}
                      onExpandFromCollapsed={(k) => {
                        setCollapsed(false);
                        localStorage.setItem('idham.sidebar.collapsed', 'false');
                        setOpenSectionKey(k);
                      }}
                      onNavigate={() => setMobileMenuOpen(false)}
                    />
                  );
                })}
              </div>
            ))
          )}
        </nav>

        {/* Sleek Compact Executive User Footer */}
        <div
          className={`relative border-t p-2.5 ${
            darkSidebarPref
              ? 'border-white/[0.08] bg-[#060b18]/85'
              : 'border-slate-200/85 bg-slate-50/75 dark:border-slate-800/85 dark:bg-[#060b18]/80'
          }`}
        >
          <div
            className={`flex items-center gap-2.5 rounded-xl border p-2 ${
              darkSidebarPref
                ? 'border-white/[0.07] bg-white/[0.05]'
                : 'border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-white/[0.04]'
            } ${collapsed && !mobileMenuOpen ? 'justify-center' : 'justify-between'}`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-sky-500 font-black text-xs text-white shadow-xs">
                {me?.user.fullName ? me.user.fullName[0] : 'م'}
                <span
                  className={`absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ${
                    darkSidebarPref ? 'ring-[#0b1329]' : 'ring-white dark:ring-[#080e1f]'
                  }`}
                />
              </div>
              {(!collapsed || mobileMenuOpen) && (
                <div className="min-w-0 text-xs animate-fade-in">
                  <div
                    className={`font-bold leading-snug ${
                      darkSidebarPref ? 'text-white' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {me?.user.fullName || 'المدير التنفيذي'}
                  </div>
                  <div
                    className={`flex flex-wrap items-center gap-1.5 text-[10.5px] font-bold leading-snug mt-0.5 ${
                      darkSidebarPref ? 'text-emerald-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    <span>{me?.user.username === 'admin' ? 'المدير التنفيذي' : `@${me?.user.username}`}</span>
                    <span className="opacity-45">•</span>
                    <span className="font-mono">ZATCA ✓</span>
                    <span className="opacity-45">•</span>
                    <span className="font-mono text-[10px] text-sky-400/90" title="معرف الإصدار السحابي الحالي">
                      v.{CURRENT_BUILD_ID}
                    </span>
                  </div>
                </div>
              )}
            </div>
            {(!collapsed || mobileMenuOpen) && (
              <button
                type="button"
                className={`flex size-7.5 shrink-0 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  darkSidebarPref
                    ? 'text-slate-400 hover:bg-rose-500/20 hover:text-rose-300'
                    : 'text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/20 dark:hover:text-rose-300'
                }`}
                onClick={() => void logout()}
                aria-label="تسجيل الخروج من النظام"
                title="تسجيل الخروج من النظام"
              >
                <LogOut className="size-4" />
                <span className="sr-only">تسجيل الخروج من النظام</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ─────────── Main Content ─────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Executive Frosted Glass Top Header Bar */}
        <header className="sticky top-0 z-20 relative flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200/95 bg-white/94 backdrop-blur-xl px-3 sm:px-4 shadow-[0_4px_20px_-12px_rgba(15,23,42,0.12)] dark:border-slate-800/90 dark:bg-[#091122]/94 dark:shadow-[0_6px_28px_-10px_rgba(0,0,0,0.65)]">
          {/* Luminous Top Edge Hairline */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-l from-indigo-600 via-sky-500 to-emerald-500 opacity-90" />

          {/* Right Cluster: Mobile Trigger + Branch + Sync + Dual Clocks */}
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          {/* Mobile Menu Trigger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex lg:hidden size-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            aria-label="فتح القائمة الجانبية"
          >
            <Menu className="size-4" />
          </button>

          {/* Company Switcher (only shown if user has multiple companies; never sets empty companyId) */}
          {me?.companies && me.companies.length > 1 && (
            <div className="hidden md:flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200/90 bg-slate-100/75 px-2.5 text-xs shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
              <Building2 className="size-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <select
                className="bg-transparent text-xs font-bold text-slate-800 dark:text-white outline-none cursor-pointer"
                value={company?.id ?? me?.companies?.[0]?.id ?? ''}
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

          {/* Active Branch Selector Glass Pill */}
          <div className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200/95 bg-slate-100/75 hover:border-indigo-400/80 px-2.5 text-xs shadow-2xs transition-colors dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-indigo-500/40">
            <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-indigo-600/12 text-indigo-700 dark:text-indigo-400">
              <Globe className="size-3.5" />
            </div>
            <select
              className="bg-transparent text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer"
              value={activeBranchId}
              onChange={(e) => handleBranchChange(e.target.value)}
              title={company?.nameAr ? `جميع الفروع — ${company.nameAr}` : 'جميع الفروع'}
            >
              <option value="" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white">
                جميع الفروع
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id} className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white">
                  {b.nameAr} ({b.functionalCurrency ?? company?.baseCurrency ?? 'SAR'})
                </option>
              ))}
            </select>
          </div>

          {/* Cloud Database & Sync Status Pill */}
          <button
            type="button"
            onClick={() => setCloudModalOpen(true)}
            className={`hidden xl:flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-2.5 text-[11.5px] font-bold transition-all cursor-pointer shadow-2xs ${
              isCloudConfigured
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/18'
                : 'border-slate-200/95 bg-slate-100/75 text-slate-800 hover:bg-slate-200/70 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
            title="حالة اتصال قاعدة البيانات والسيرفر السحابي (اضغط لضبط السحابة والمزامنة الفورية)"
          >
            <span className={`size-2 shrink-0 rounded-full ${isCloudConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="whitespace-nowrap">{isCloudConfigured ? 'سحابي متصل' : 'محلي آمن'}</span>
            <Database className="size-3 shrink-0 opacity-75" />
          </button>

          {/* Dual Live Clocks: Mecca & Cairo */}
          <div className="hidden 2xl:flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200/95 bg-slate-100/75 px-2.5 text-xs text-slate-800 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200">
            <div className="flex items-center gap-1 whitespace-nowrap font-bold">
              <span className="text-[11px]">🇸🇦</span>
              <span className="num font-mono text-slate-900 dark:text-white font-bold">{meccaTime}</span>
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">مكة</span>
            </div>
            <span className="h-3.5 w-px bg-slate-300 dark:bg-slate-700" />
            <div className="flex items-center gap-1 whitespace-nowrap font-bold">
              <span className="text-[11px]">🇪🇬</span>
              <span className="num font-mono text-slate-900 dark:text-white font-bold">{cairoTime}</span>
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">القاهرة</span>
            </div>
          </div>
          </div>

          {/* Center Spotlight Command Search Bar (Ctrl + K) */}
          <div className="flex flex-1 justify-center px-1 min-w-0 max-w-[260px]">
            <button
              type="button"
              onClick={() => {
                setCmdOpen(true);
                setCmdQuery('');
                setCmdIndex(0);
              }}
              className="group flex h-9 w-full min-w-[132px] items-center justify-between gap-2 whitespace-nowrap rounded-xl border border-slate-200/95 bg-slate-100/75 hover:bg-white hover:border-indigo-400/80 hover:shadow-xs px-2.5 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:border-indigo-500/50 transition-all cursor-pointer"
              title="البحث الشامل الفوري عن موظف، مشروع، فاتورة، قيد، أو شاشة (Ctrl+K)"
            >
              <span className="flex items-center gap-1.5 shrink-0">
                <Search className="size-3.5 shrink-0 text-indigo-600 dark:text-indigo-400 transition-transform group-hover:scale-110" />
                <span className="hidden 2xl:inline">ابحث في النظام…</span>
                <span className="2xl:hidden">بحث شامل</span>
              </span>
              <kbd className="hidden lg:inline-flex shrink-0 items-center gap-0.5 rounded-md border border-slate-300/80 bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Ctrl+K
              </kbd>
            </button>
          </div>

          {/* Fast Command & Unified Navigation Pills */}
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Smart Automation & Auto-Journal Hub CTA */}
            <NavLink
              to="/automation/hub"
              className={({ isActive }) =>
                `flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border font-bold px-2.5 text-xs shadow-2xs transition-all active:scale-95 ${
                  isActive
                    ? 'border-amber-500/60 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-amber-500/25'
                    : 'border-amber-400/50 bg-amber-50/90 hover:bg-amber-100/90 text-amber-950 dark:bg-amber-500/15 dark:text-amber-200 dark:hover:bg-amber-500/25'
                }`
              }
              title="مركز الأتمتة الذكية والتوليد التلقائي للقيود المحاسبية"
            >
              <Zap className="size-3.5 shrink-0 text-amber-500 fill-amber-500" />
              <span className="hidden sm:inline whitespace-nowrap">الأتمتة الآلية</span>
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </NavLink>

            {/* Primary Royal Indigo CTA: + فاتورة */}
            <NavLink
              to="/sal/invoices"
              className="flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-xl bg-gradient-to-b from-indigo-500 via-indigo-600 to-indigo-700 hover:brightness-110 text-white font-bold px-3 text-xs shadow-sm shadow-indigo-600/30 ring-1 ring-inset ring-white/15 transition-all active:scale-95"
              title="إنشاء فاتورة مبيعات / تأجير جديدة"
            >
              <Plus className="size-3.5 shrink-0 stroke-[2.75]" />
              <span className="hidden sm:inline whitespace-nowrap">فاتورة</span>
            </NavLink>

            {/* Unified Segmented Quick Shortcuts Bar (الخزينة | القيود | الحسابات) */}
            <div className="hidden md:flex h-9 shrink-0 items-center rounded-xl border border-slate-200/95 bg-slate-100/80 p-0.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
              <NavLink
                to="/treasury/hub"
                className={({ isActive }) =>
                  `flex h-full items-center gap-1 whitespace-nowrap rounded-lg px-2 text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-white text-emerald-700 shadow-2xs dark:bg-slate-800 dark:text-emerald-300'
                      : 'text-slate-800 hover:text-indigo-700 hover:bg-white/80 dark:text-slate-200 dark:hover:text-white dark:hover:bg-slate-800/60'
                  }`
                }
                title="لوحة الخزينة والبنوك وسندات القبض والصرف والشيكات"
              >
                <Vault className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="whitespace-nowrap">الخزينة</span>
              </NavLink>
              <span className="h-4 w-px bg-slate-300/80 dark:bg-slate-800" />
              <NavLink
                to="/acc/journals"
                className={({ isActive }) =>
                  `hidden lg:flex h-full items-center gap-1 whitespace-nowrap rounded-lg px-2 text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-white text-indigo-700 shadow-2xs dark:bg-slate-800 dark:text-indigo-300'
                      : 'text-slate-800 hover:text-indigo-700 hover:bg-white/80 dark:text-slate-200 dark:hover:text-white dark:hover:bg-slate-800/60'
                  }`
                }
                title="دفتر قيود اليومية"
              >
                <FileText className="size-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <span className="whitespace-nowrap">القيود</span>
              </NavLink>
              <span className="hidden xl:inline-block h-4 w-px bg-slate-300/80 dark:bg-slate-800" />
              <NavLink
                to="/acc/accounts"
                className={({ isActive }) =>
                  `hidden xl:flex h-full items-center gap-1 whitespace-nowrap rounded-lg px-2 text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-white text-sky-700 shadow-2xs dark:bg-slate-800 dark:text-sky-300'
                      : 'text-slate-800 hover:text-indigo-700 hover:bg-white/80 dark:text-slate-200 dark:hover:text-white dark:hover:bg-slate-800/60'
                  }`
                }
                title="دليل وشجرة الحسابات المحاسبية"
              >
                <BookOpen className="size-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                <span className="whitespace-nowrap">الحسابات</span>
              </NavLink>
            </div>

            {/* Theme Toggle Pill Button */}
            <button
              type="button"
              onClick={toggle}
              className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200/95 bg-slate-100/80 hover:bg-white hover:border-indigo-400/80 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 px-2.5 text-xs font-bold shadow-2xs transition-all cursor-pointer"
              title={dark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'}
            >
              {dark ? (
                <>
                  <Sun className="size-3.5 shrink-0 text-amber-400" />
                  <span className="hidden sm:inline whitespace-nowrap">نهاري</span>
                </>
              ) : (
                <>
                  <Moon className="size-3.5 shrink-0 text-indigo-600" />
                  <span className="hidden sm:inline whitespace-nowrap">ليلي</span>
                </>
              )}
            </button>

            {/* Jobs Center Queue Modal Trigger */}
            <JobsCenterButton />
          </div>
        </header>

        {/* Main Body */}
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 md:p-6">
          {/* Active Module Breadcrumb Bar on Non-Dashboard Screens */}
          {activeBreadcrumb && (
            <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white/92 backdrop-blur-md px-3.5 py-2 text-xs shadow-2xs dark:border-slate-800/80 dark:bg-[#0b1224]/85 animate-fade-in">
              <div className="flex flex-wrap items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <Link
                  to="/"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-2 py-0.5 font-extrabold text-indigo-800 hover:bg-indigo-500/18 dark:text-indigo-300 transition-colors"
                >
                  <LayoutDashboard className="size-3.5" />
                  <span>لوحة المؤشرات</span>
                </Link>
                <ChevronLeft className="size-3.5 opacity-60" />
                <span className="font-extrabold text-slate-900 dark:text-slate-100">{activeBreadcrumb.section}</span>
                {activeBreadcrumb.item && (
                  <>
                    <ChevronLeft className="size-3.5 opacity-60" />
                    <span className="rounded-lg bg-indigo-50 dark:bg-slate-800/90 px-2 py-0.5 font-black text-indigo-800 dark:text-indigo-200">
                      {activeBreadcrumb.item}
                    </span>
                  </>
                )}
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[11.5px] font-extrabold text-slate-800 dark:text-slate-200">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span>{company?.nameAr}</span>
                <span className="opacity-45">•</span>
                <span className="rounded-md bg-indigo-500/12 border border-indigo-500/25 px-1.5 py-0.5 font-mono text-[10.5px] font-black text-indigo-800 dark:text-indigo-200">
                  {company?.baseCurrency || 'SAR'}
                </span>
              </div>
            </div>
          )}

          <ErrorBoundary key={loc.pathname}>
            {children ?? <Outlet />}
          </ErrorBoundary>
        </main>
      </div>

      {/* ─────────── Unified Royal A4 Print Preview & Direct PDF Modal ─────────── */}
      <RoyalPrintPreviewModal />

      {/* ─────────── Global Command Palette Modal (Ctrl+K) ─────────── */}
      {cmdOpen && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center bg-slate-950/75 p-4 pt-[10vh] backdrop-blur-xs animate-fade-in"
          onClick={() => setCmdOpen(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#0c1427] animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1 w-full bg-gradient-to-l from-indigo-600 via-indigo-500 to-sky-500" />
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800/90">
              <Command className="size-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
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
                placeholder="ابحث فوراً عن موظف، مشروع، فاتورة، قيد، حساب، أو شاشة... (مثال: محمد، 001، INV، 10301)"
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
                          ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300'
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
        </div>,
        document.body
      )}

      {/* Cloud Database & Central Server Configuration Modal */}
      <Modal
        open={cloudModalOpen}
        onClose={() => setCloudModalOpen(false)}
        title="ربط قاعدة البيانات والسيرفر السحابي المركزي"
        wide
        footer={
          <div className="flex w-full items-center justify-between">
            <button
              type="button"
              className="btn-ghost text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              onClick={() => {
                if (confirm('هل تريد إلغاء الرابط والعودة للوضع المحلي؟')) {
                  setCustomApiUrl(null);
                  window.location.reload();
                }
              }}
            >
              إلغاء الرابط والعودة للوضع المحلي
            </button>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => setCloudModalOpen(false)}>
                إغلاق
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setCustomApiUrl(cloudUrlInput);
                  window.location.reload();
                }}
              >
                حفظ وتفعيل الاتصال السحابي
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          <div className={`p-4 rounded-xl border flex items-start gap-3 ${
            isCloudConfigured
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
          }`}>
            <div className="shrink-0 mt-0.5">
              {isCloudConfigured ? <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" /> : <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400" />}
            </div>
            <div>
              <div className="font-extrabold text-sm mb-1">
                {isCloudConfigured ? 'المنظومة موصولة بسيرفر سحابي' : 'المنظومة تعمل حالياً بالوضع المحلي (ذاكرة المتصفح فقط)'}
              </div>
              <p className="leading-relaxed">
                {isCloudConfigured
                  ? `أنت متصل بسيرفر سحابي على العنوان (${getCustomApiUrl()}). جميع أجهزتك ترسل وتستقبل البيانات في نفس الثانية.`
                  : 'أنت تتصفح الواجهة بنظام الذاكرة المؤقتة لجهازك الحالي فقط؛ لذلك لا تظهر الإدخالات على الأجهزة الأخرى. لتفعيل المزامنة المباشرة بين كافة الفروع والجوالات، أدخل رابط السيرفر السحابي أو السيرفر المستضاف.'}
              </p>
            </div>
          </div>

          <div className="card p-4 space-y-3 bg-slate-50 dark:bg-slate-900/40">
            <label className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
              <Server className="size-4 text-indigo-600 dark:text-indigo-400" />
              عنوان السيرفر السحابي (Cloud API Endpoint):
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex items-center gap-2 flex-1">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  <Cloud className="size-4" />
                </div>
                <input
                  type="url"
                  dir="ltr"
                  className="input font-mono flex-1 text-sm"
                  placeholder="https://api.yourdomain.com أو https://idham-api.onrender.com"
                  value={cloudUrlInput}
                  onChange={(e) => setCloudUrlInput(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn-secondary text-xs flex items-center justify-center gap-1.5 shrink-0 px-3 py-2 cursor-pointer"
                disabled={testingPing}
                onClick={handleTestCloudPing}
                title="فحص الاتصال الفوري بالسيرفر وقياس سرعة الاستجابة"
              >
                {testingPing ? <Loader2 className="size-3.5 animate-spin" /> : <Activity className="size-3.5 text-indigo-600 dark:text-indigo-400" />}
                <span>فحص الاتصال (Ping Test)</span>
              </button>
            </div>
            {pingResult && (
              <div className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 animate-fade-in ${
                pingResult.ok
                  ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300/80 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300/80 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              }`}>
                {pingResult.ok ? (
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="size-4 text-rose-600 dark:text-rose-400 shrink-0" />
                )}
                <span className="font-semibold">{pingResult.message}</span>
              </div>
            )}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              ملاحظة: يمكنك نشر مجلد <code>apps/api</code> على منصات سحابية سريعة مثل Render أو Railway أو Supabase ووضع رابطه هنا لتعمل كل الشاشات حية 100% متزامنة بين جميع الفروع.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
