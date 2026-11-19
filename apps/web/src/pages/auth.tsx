import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Building2, KeyRound, ShieldCheck, UserCog, User, Lock, Eye, EyeOff,
  Sparkles, ArrowLeft, Layers, Briefcase, Calculator,
  TrendingUp, Wallet, Check, Zap, Award, Landmark,
  Sun, Moon, HelpCircle, CheckCircle2, BookOpen, FileText, Users, Clock, Database, Cloud,
} from 'lucide-react';
import { api, ApiError, getCustomApiUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { defaultAccountsList } from '../lib/fallback-engine';
import { getEntityList } from '../lib/local-store';
import { getStoredCompany } from '../lib/storage-company';
import { Field, Modal, Spinner, useToast } from '../components/ui';

/** ISO currency codes offered in the wizard (reference metadata, not business data). */
const CURRENCIES = ['EGP', 'SAR', 'AED', 'USD', 'EUR', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'GBP'];

/**
 * Unified Full-Viewport Background Canvas (100% cohesive in both Light & Dark modes — zero split clash).
 */
function UnifiedAuthCanvas({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-br from-[#eef3fc] via-[#f5f8ff] to-[#e8f2fc] dark:from-[#060b18] dark:via-[#0a1228] dark:to-[#071022] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
      {/* Unified Ambient Glow Orbs across the entire canvas */}
      <div className="pointer-events-none fixed -top-36 right-1/4 size-[34rem] rounded-full bg-indigo-500/12 dark:bg-indigo-500/18 blur-3xl" />
      <div className="pointer-events-none fixed top-1/3 -left-28 size-[30rem] rounded-full bg-sky-500/12 dark:bg-sky-500/15 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-36 right-12 size-[28rem] rounded-full bg-emerald-500/10 dark:bg-emerald-500/12 blur-3xl" />

      {/* Subtle Unified Architectural Dot Matrix */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35] dark:opacity-[0.06]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(99, 102, 241, 0.22) 1px, transparent 0)',
          backgroundSize: '26px 26px',
        }}
      />

      <div className="relative z-10 min-h-screen flex flex-col justify-between">
        {children}
      </div>
    </div>
  );
}

function Shell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  return (
    <UnifiedAuthCanvas>
      <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-sky-500 text-white shadow-lg shadow-indigo-600/25">
              <Landmark className="size-7" />
            </div>
            <div className="inline-flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">IDHAM ERP</h1>
              <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                PRO 2026
              </span>
            </div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">
              منظومة الموارد البشرية والمشاريع والمحاسبة المتكاملة
            </p>
          </div>
          <div className="rounded-3xl border border-indigo-100/90 dark:border-slate-800/90 bg-white/90 dark:bg-[#0d162c]/90 backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-indigo-950/5 dark:shadow-black/40">
            <h2 className="mb-1 text-lg font-extrabold text-slate-900 dark:text-white">{title}</h2>
            {subtitle && <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
            {children}
          </div>
        </div>
      </div>
    </UnifiedAuthCanvas>
  );
}

const fieldErr = (e: unknown, path: string) =>
  e instanceof ApiError ? e.problem.errors?.find((x) => x.path === path || x.path.endsWith(`.${path}`))?.message : undefined;

export function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('AdminPass12345!');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [selectedRole, setSelectedRole] = useState<'admin' | 'finance' | 'pmo'>('admin');
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const storedCompany = useMemo(() => getStoredCompany(), []);
  const customCloudUrl = getCustomApiUrl();
  const isCloudConnected = Boolean(customCloudUrl);

  // Live workspace metrics from persistent store
  const liveStats = useMemo(() => {
    const employees = getEntityList<any>('employees', []).length;
    const projects = getEntityList<any>('projects', []).length;
    const invoices = getEntityList<any>('invoices', []).filter((i) => i.status !== 'CANCELLED').length;
    const journals = getEntityList<any>('journal_entries', []).filter((j) => j.status === 'POSTED').length;
    const accounts = getEntityList<any>('accounts', defaultAccountsList).length;
    return { employees, projects, invoices, journals, accounts };
  }, []);

  useEffect(() => {
    const clockTimer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(clockTimer);
  }, []);

  const riyadhTime = useMemo(
    () => new Intl.DateTimeFormat('ar-SA', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' }).format(now),
    [now],
  );
  const cairoTime = useMemo(
    () => new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }).format(now),
    [now],
  );

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    document.documentElement.classList.toggle('dark', nextDark);
    localStorage.setItem('idham.theme', nextDark ? 'dark' : 'light');
  };

  const DEMO_ACCOUNTS = [
    {
      roleKey: 'admin' as const,
      roleTitle: 'مدير النظام التنفيذي',
      roleSub: 'كامل الصلاحيات والإقفال',
      u: 'admin',
      p: 'AdminPass12345!',
      icon: Award,
      badgeColor: 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
    },
    {
      roleKey: 'finance' as const,
      roleTitle: 'مدير مالي ومحاسب',
      roleSub: 'القيود والفواتير والضرائب',
      u: 'accountant',
      p: 'Finance123!',
      icon: Calculator,
      badgeColor: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    },
    {
      roleKey: 'pmo' as const,
      roleTitle: 'مدير مشاريع وعمليات',
      roleSub: 'تخصيص الكوادر والربحية',
      u: 'pmo',
      p: 'PmoPass123!',
      icon: Briefcase,
      badgeColor: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30',
    },
  ];

  const handleSelectRole = (roleKey: 'admin' | 'finance' | 'pmo') => {
    setSelectedRole(roleKey);
    const acc = DEMO_ACCOUNTS.find((a) => a.roleKey === roleKey);
    if (acc) {
      setUsername(acc.u);
      setPassword(acc.p);
    }
  };

  const SLIDES = [
    {
      id: 0,
      tag: 'الفوترة الإلكترونية ZATCA',
      title: 'الربط المباشر مع هيئة الزكاة والضريبة والجمارك (Phase 2)',
      desc: 'إصدار وترحيل الفواتير الضريبية والمبسطة والإشعارات الدائنة والمدينة بصيغة UBL XML 2.1 القياسية، مع التوقيع الرقمي CSID وبصمة SHA-256 ورمز QR المشفر (TLV).',
      icon: ShieldCheck,
      pill: 'معتمد ومطابق 100%',
      highlights: [
        'توليد آلي للفواتير من تخصيصات المشاريع بنقرة واحدة',
        'قيد يومية مزدوج فوري لكل فاتورة وسند تحصيل',
        'إقرار ضريبة القيمة المضافة والزكاة الشرعية وتوليد قيود التسوية',
      ],
    },
    {
      id: 1,
      tag: 'حوكمة المشاريع والربحية',
      title: 'تتبع الكوادر بالأيام الفعلية ومصفوفة الربحية الثلاثية',
      desc: 'ربط حي وموحد بين تكلفة الموظف المحمّلة (الراتب + التأمينات + الطبي + الإهلاك) وأيام إسناده على المشاريع لحساب الإيراد وصافي الربح وتكلفة التفرغ (Bench) بدقة متطابقة.',
      icon: Layers,
      pill: 'تطابق مالي 100%',
      highlights: [
        'ربحية فورية على 3 مستويات: الموظف ← المشروع ← العميل',
        'تنبيهات ذكية لاستثمار أيام التفرغ الشاغره (Bench Optimization)',
        'مرونة التسعير اليومي والشهري والساعي مع أسعار خاصة لكل مشروع',
      ],
    },
    {
      id: 2,
      tag: 'الرواتب والعهد متعددة العملات',
      title: 'إدارة متكاملة لرواتب وعهد الفروع الإقليمية (SAR / EGP)',
      desc: 'معالجة مسيّرات الرواتب والمتغيرات الشهرية وسلف الموظفين ومكافأة نهاية الخدمة وعهد الفروع بعملات متعددة، مع احتساب فروق العملة المحققة آلياً.',
      icon: Wallet,
      pill: 'دعم SAR • EGP • USD',
      highlights: [
        'فصل آلي في قيد الرواتب بين تكلفة المشاريع وتكلفة التفرغ',
        'دورة عهد نقدية كاملة من الصرف والتحويل حتى التسوية والإقفال',
        'تحويلات بنكية وصرافة عملات بين حسابات الرياض والقاهرة',
      ],
    },
    {
      id: 3,
      tag: 'الأتمتة المحاسبية والقوائم',
      title: 'قيود يومية آلية متوازنة وقوائم مالية حية لحظياً',
      desc: 'كل عملية تشغيلية في المبيعات أو المشتريات أو الرواتب أو الأصول أو العهد تولّد قيدها المحاسبي المتوازن فوراً وتنعكس في ميزان المراجعة وقائمة الدخل والمركز المالي.',
      icon: TrendingUp,
      pill: 'رقابة وحوكمة SHA-256',
      highlights: [
        'ميزان مراجعة وقائمة دخل وميزانية عمومية متوازنة لحظياً',
        'إقفال فترات مالية محمي ببصمة تشفير SHA-256 وسجل تدقيق كامل',
        'تصدير احترافي Excel / PDF وطباعة رسمية موحدة لكافة الكشوف',
      ],
    },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % SLIDES.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [SLIDES.length]);

  const submit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setBusy(true);
    try {
      await login(username, password, rememberMe);
      toast.success('مرحباً بك! تم تسجيل الدخول بنجاح');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const handleInstantLogin = async (u = username, p = password) => {
    setBusy(true);
    try {
      await login(u, p, rememberMe);
      toast.success('تم تسجيل الدخول بنجاح! جاري فتح المنظومة...');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const currentSlide = SLIDES[activeSlide];
  const SlideIcon = currentSlide.icon;

  return (
    <UnifiedAuthCanvas>
      {/* ── Unified Top Executive Header ── */}
      <header className="w-full border-b border-indigo-200/60 dark:border-slate-800/80 bg-white/65 dark:bg-[#080f20]/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-8">
          {/* Brand Identity */}
          <div className="flex items-center gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-600/25">
              <Landmark className="size-5.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-white">
                  IDHAM ERP
                </span>
                <span className="rounded-md bg-indigo-600/12 dark:bg-indigo-500/20 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300 border border-indigo-500/25">
                  PRO 2026
                </span>
                {storedCompany?.nameAr && (
                  <span className="hidden md:inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                    {storedCompany.nameAr}
                  </span>
                )}
              </div>
              <div className="text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400">
                منظومة الموارد البشرية والمشاريع والمحاسبة المتكاملة (السعودية ومصر)
              </div>
            </div>
          </div>

          {/* Live Regional Clocks, Status & Unified Theme Switch */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="hidden md:flex items-center gap-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <Clock className="size-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>الرياض <strong className="font-mono text-slate-900 dark:text-white">{riyadhTime}</strong></span>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span>القاهرة <strong className="font-mono text-slate-900 dark:text-white">{cairoTime}</strong></span>
            </div>

            <span
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-extrabold border ${
                isCloudConnected
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                  : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25'
              }`}
            >
              {isCloudConnected ? <Cloud className="size-3.5 text-emerald-500" /> : <Database className="size-3.5 text-indigo-500" />}
              <span>{isCloudConnected ? 'متصل بالسحابة' : 'محرك محلي فوري'}</span>
            </span>

            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700/90 bg-white/90 hover:bg-white dark:bg-slate-900/90 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs transition-all cursor-pointer"
              title="تبديل المظهر الموحد (نهاري / ليلي)"
            >
              {isDark ? (
                <>
                  <Sun className="size-4 text-amber-400" />
                  <span>الوضع النهاري</span>
                </>
              ) : (
                <>
                  <Moon className="size-4 text-indigo-600" />
                  <span>الوضع الليلي</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Centered Two-Column Content on the Unified Canvas ── */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 items-center px-4 py-6 sm:px-8 lg:py-10">
        <div className="grid w-full grid-cols-1 items-center gap-6 lg:grid-cols-12 lg:gap-10">
          {/* Right Column (RTL Start): Executive Welcome & Live System Intelligence (7 cols) */}
          <div className="lg:col-span-7 space-y-5 order-2 lg:order-1">
            {/* Hero Welcome Intro */}
            <div className="space-y-3">
              <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-3.5 py-1 text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
                <Sparkles className="size-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>منصة تخطيط الموارد المؤسسية المتكاملة</span>
                <span className="opacity-40">•</span>
                <span className="text-emerald-700 dark:text-emerald-400">أتمتة شاملة للقيود والتقارير</span>
              </div>

              <h1 className="text-2xl sm:text-3xl xl:text-[2.1rem] font-black leading-[1.3] tracking-tight text-slate-900 dark:text-white">
                تحكم كامل في الكوادر والمشاريع والفوترة الضريبية والربحية اللحظية
              </h1>

              <p className="text-xs sm:text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300 max-w-2xl">
                بيئة عمل تنفيذية موحدة تربط دورة الموارد البشرية وتكاليف المطورين بإسناد المشاريع، فواتير المبيعات الإلكترونية المعتمدة من <strong className="font-extrabold text-slate-900 dark:text-white">ZATCA</strong>، وشجرة الحسابات العامة دون أي إدخال مكرر.
              </p>
            </div>

            {/* Interactive 4-Pillar Feature Card (Matching Unified Glass Surface) */}
            <div className="rounded-3xl border border-indigo-100/90 dark:border-slate-800/90 bg-white/85 dark:bg-[#0d162c]/85 p-5 sm:p-6 shadow-xl shadow-indigo-950/5 dark:shadow-black/30 backdrop-blur-xl space-y-4">
              {/* Module Selector Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SLIDES.map((s, idx) => {
                  const TabIcon = s.icon;
                  const isActive = activeSlide === idx;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveSlide(idx)}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-start text-[11px] font-extrabold transition-all cursor-pointer border ${
                        isActive
                          ? 'bg-gradient-to-l from-indigo-600 to-sky-600 text-white border-transparent shadow-md shadow-indigo-600/20'
                          : 'bg-slate-50/90 hover:bg-indigo-50/70 text-slate-700 border-slate-200/80 dark:bg-slate-900/70 dark:hover:bg-slate-800/80 dark:text-slate-300 dark:border-slate-800'
                      }`}
                    >
                      <TabIcon className={`size-3.5 shrink-0 ${isActive ? 'text-white' : 'text-indigo-600 dark:text-sky-400'}`} />
                      <span className="truncate">{s.tag}</span>
                    </button>
                  );
                })}
              </div>

              {/* Active Slide Content */}
              <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-gradient-to-br from-indigo-50/50 via-white to-sky-50/40 dark:from-[#091022] dark:via-[#0c152b] dark:to-[#091426] p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
                    <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-600/12 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300">
                      <SlideIcon className="size-4" />
                    </div>
                    <span>{currentSlide.tag}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="size-3" />
                    {currentSlide.pill}
                  </span>
                </div>

                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug">
                  {currentSlide.title}
                </h3>

                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {currentSlide.desc}
                </p>

                <div className="grid grid-cols-1 gap-1.5 pt-1">
                  {currentSlide.highlights.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        <Check className="size-2.5 stroke-[3]" />
                      </span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Workspace Snapshot Strip (4 Real Data Counters) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-2xl border border-indigo-100/90 dark:border-slate-800/90 bg-white/80 dark:bg-[#0d162c]/80 backdrop-blur-md px-3.5 py-3 shadow-xs">
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] font-bold">
                  <span>الكوادر المسجلة</span>
                  <Users className="size-3.5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="mt-1 font-mono text-lg font-black text-slate-900 dark:text-white">
                  {liveStats.employees}
                </div>
                <div className="text-[10px] font-semibold text-slate-400">ملف موظف وتكلفة</div>
              </div>

              <div className="rounded-2xl border border-indigo-100/90 dark:border-slate-800/90 bg-white/80 dark:bg-[#0d162c]/80 backdrop-blur-md px-3.5 py-3 shadow-xs">
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] font-bold">
                  <span>المشاريع النشطة</span>
                  <Briefcase className="size-3.5 text-sky-600 dark:text-sky-400" />
                </div>
                <div className="mt-1 font-mono text-lg font-black text-slate-900 dark:text-white">
                  {liveStats.projects}
                </div>
                <div className="text-[10px] font-semibold text-slate-400">عقد وميزانية ربحية</div>
              </div>

              <div className="rounded-2xl border border-indigo-100/90 dark:border-slate-800/90 bg-white/80 dark:bg-[#0d162c]/80 backdrop-blur-md px-3.5 py-3 shadow-xs">
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] font-bold">
                  <span>الفواتير الضريبية</span>
                  <FileText className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="mt-1 font-mono text-lg font-black text-slate-900 dark:text-white">
                  {liveStats.invoices}
                </div>
                <div className="text-[10px] font-semibold text-slate-400">متوافقة مع ZATCA</div>
              </div>

              <div className="rounded-2xl border border-indigo-100/90 dark:border-slate-800/90 bg-white/80 dark:bg-[#0d162c]/80 backdrop-blur-md px-3.5 py-3 shadow-xs">
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] font-bold">
                  <span>الحسابات والقيود</span>
                  <BookOpen className="size-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="mt-1 font-mono text-lg font-black text-slate-900 dark:text-white">
                  {liveStats.accounts} <span className="text-xs font-normal text-slate-400">/ {liveStats.journals} قيد</span>
                </div>
                <div className="text-[10px] font-semibold text-slate-400">ميزان مراجعة متوازن</div>
              </div>
            </div>
          </div>

          {/* Left Column (RTL End): Executive Login Portal Card (5 cols) */}
          <div className="lg:col-span-5 order-1 lg:order-2">
            <div className="mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-indigo-100/90 dark:border-slate-800/90 bg-white/92 dark:bg-[#0d162c]/92 shadow-2xl shadow-indigo-950/10 dark:shadow-black/50 backdrop-blur-xl">
              {/* Top Signature Gradient Bar */}
              <div className="h-1.5 w-full bg-gradient-to-l from-indigo-600 via-sky-500 to-emerald-500" />

              <div className="p-6 sm:p-7 space-y-5">
                {/* Card Header */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-extrabold text-indigo-700 dark:text-indigo-300">
                      <ShieldCheck className="size-3.5" /> بوابة الدخول الموحدة
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400">
                      <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                      جاهز للتشغيل
                    </span>
                  </div>
                  <h2 className="pt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                    تسجيل الدخول للمنظومة
                  </h2>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    اختر الدور الوظيفي للدخول السريع بنقرة واحدة، أو أدخل بيانات حسابك أدناه.
                  </p>
                </div>

                {/* Role Quick-Selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <span>اختيار سريع للدور الوظيفي:</span>
                    <span className="text-indigo-600 dark:text-indigo-400">تعبئة تلقائية</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {DEMO_ACCOUNTS.map((acc) => {
                      const IconComponent = acc.icon;
                      const isCurrent = selectedRole === acc.roleKey;
                      return (
                        <button
                          key={acc.roleKey}
                          type="button"
                          onClick={() => handleSelectRole(acc.roleKey)}
                          className={`relative rounded-xl border p-2.5 text-start transition-all cursor-pointer ${
                            isCurrent
                              ? 'border-indigo-500 bg-indigo-50/90 text-slate-900 shadow-xs ring-2 ring-indigo-500/20 dark:bg-indigo-500/15 dark:text-white'
                              : 'border-slate-200/90 bg-slate-50/80 text-slate-700 hover:bg-slate-100/90 dark:border-slate-800 dark:bg-[#091020] dark:text-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          <div className="mb-1.5 flex items-center justify-between">
                            <div className={`flex size-6 items-center justify-center rounded-lg border ${acc.badgeColor}`}>
                              <IconComponent className="size-3.5" />
                            </div>
                            {isCurrent && <Check className="size-3.5 text-indigo-600 dark:text-indigo-400" />}
                          </div>
                          <div className="truncate text-[11px] font-extrabold leading-snug">{acc.roleTitle}</div>
                          <div className="truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">{acc.u}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 1-Click Instant Launch CTA */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleInstantLogin()}
                  className="btn-primary w-full h-11 text-xs font-black gap-2 shadow-lg shadow-indigo-600/20"
                >
                  {busy ? (
                    <Spinner />
                  ) : (
                    <>
                      <Zap className="size-4" />
                      <span>دخول فوري كـ ({DEMO_ACCOUNTS.find((a) => a.roleKey === selectedRole)?.roleTitle})</span>
                      <ArrowLeft className="size-3.5 ms-1" />
                    </>
                  )}
                </button>

                {/* Divider */}
                <div className="relative flex items-center py-0.5">
                  <div className="grow border-t border-slate-200 dark:border-slate-800" />
                  <span className="mx-3 shrink text-[11px] font-bold text-slate-400">أو تسجيل الدخول اليدوي</span>
                  <div className="grow border-t border-slate-200 dark:border-slate-800" />
                </div>

                {/* Manual Login Form */}
                <form onSubmit={submit} className="space-y-3.5">
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between text-xs font-extrabold text-slate-700 dark:text-slate-300">
                      <span>اسم المستخدم أو البريد الإلكتروني</span>
                      <span className="font-mono text-[10px] text-slate-400">Username</span>
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-slate-400">
                        <User className="size-4" />
                      </div>
                      <input
                        type="text"
                        dir="ltr"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="admin"
                        autoComplete="username"
                        className="input h-10 ps-10 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between text-xs font-extrabold text-slate-700 dark:text-slate-300">
                      <span>كلمة المرور</span>
                      <button
                        type="button"
                        onClick={() => setShowHelpModal(true)}
                        className="text-[11px] font-bold text-indigo-600 hover:underline dark:text-sky-400 cursor-pointer"
                      >
                        مساعدة في الدخول؟
                      </button>
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-slate-400">
                        <Lock className="size-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        dir="ltr"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        autoComplete="current-password"
                        className="input h-10 ps-10 pe-10 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 end-0 flex items-center pe-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                        title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-0.5 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-600 dark:text-slate-400 select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800"
                      />
                      <span>تذكر بيانات الجلسة على هذا الجهاز</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={busy || !username || !password}
                    className="btn-secondary w-full h-10 text-xs font-extrabold gap-2 border-indigo-200/90 text-indigo-700 hover:bg-indigo-50/80 dark:border-indigo-500/30 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
                  >
                    {busy ? <Spinner /> : <KeyRound className="size-4" />}
                    <span>تسجيل الدخول بالبيانات أعلاه</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Unified Bottom Compliance & Architecture Bar ── */}
      <footer className="w-full border-t border-indigo-200/60 dark:border-slate-800/80 bg-white/55 dark:bg-[#080f20]/65 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-[11px] font-bold text-slate-600 dark:text-slate-400 sm:px-8">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              <strong className="font-mono text-slate-900 dark:text-white">ZATCA Phase 2</strong> الفوترة الإلكترونية المعتمدة
            </span>
            <span className="hidden sm:inline text-slate-300 dark:text-slate-700">•</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-indigo-500" />
              <strong className="font-mono text-slate-900 dark:text-white">HR & PMO</strong> تتبع الأيام والربحية الفعلية
            </span>
            <span className="hidden sm:inline text-slate-300 dark:text-slate-700">•</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-sky-500" />
              <strong className="font-mono text-slate-900 dark:text-white">SAR / EGP</strong> محاسبة متعددة العملات والفروع
            </span>
          </div>
          <div className="text-slate-500 dark:text-slate-400">
            © {new Date().getFullYear()} {storedCompany?.nameAr || 'IDHAM ERP'} — جميع الحقوق محفوظة
          </div>
        </div>
      </footer>

      {/* Help Modal */}
      <Modal
        open={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        title="بيانات الدخول والاستعادة"
        footer={
          <button type="button" onClick={() => setShowHelpModal(false)} className="btn-primary text-xs">
            حسناً، فهمت
          </button>
        }
      >
        <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
            <HelpCircle className="size-4 text-indigo-500" />
            <span>حسابات الأدوار المهيأة في المنظومة:</span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#080d1a] border border-slate-200 dark:border-slate-800 space-y-1.5 font-mono text-[11px]">
            <div>• مدير النظام: <strong className="text-slate-900 dark:text-white">admin</strong> / <strong>AdminPass12345!</strong></div>
            <div>• مدير الحسابات: <strong className="text-slate-900 dark:text-white">accountant</strong> / <strong>Finance123!</strong></div>
            <div>• مدير العمليات: <strong className="text-slate-900 dark:text-white">pmo</strong> / <strong>PmoPass123!</strong></div>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-[11px]">
            لإعادة تعيين كلمة مرور لمستخدم في بيئة الإنتاج، يرجى التواصل مع مدير المنظومة من شاشة «إدارة المستخدمين».
          </p>
        </div>
      </Modal>
    </UnifiedAuthCanvas>
  );
}

export function ChangePasswordPage({ forced }: { forced?: boolean }) {
  const { reload } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/password/change', { currentPassword: cur, newPassword: next });
      toast.success('تم تغيير كلمة المرور بنجاح');
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="تغيير كلمة المرور" subtitle={forced ? 'يجب تغيير كلمة المرور قبل المتابعة للحفاظ على أمان حسابك' : undefined}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="كلمة المرور الحالية">
          <input className="input" dir="ltr" type="password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </Field>
        <Field label="كلمة المرور الجديدة" hint="10 أحرف على الأقل وتحتوي على حروف وأرقام">
          <input className="input" dir="ltr" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="تأكيد كلمة المرور" error={confirm && confirm !== next ? 'غير متطابقة' : undefined}>
          <input className="input" dir="ltr" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <button className="btn-primary w-full" disabled={busy || next.length < 10 || next !== confirm}>
          {busy && <Spinner />} حفظ وتحديث كلمة المرور
        </button>
      </form>
    </Shell>
  );
}

export function SetupWizard() {
  const { markSetupDone } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const year = new Date().getFullYear();
  const [company, setCompany] = useState({ code: '', nameAr: '', nameEn: '', legalName: '', taxNumber: '', countryCode: 'SA', timezone: 'Asia/Riyadh', baseCurrency: 'SAR', fiscalYearStartMonth: 1 });
  const [fy, setFy] = useState({ code: `FY${year}`, startDate: `${year}-01-01` });
  const [admin, setAdmin] = useState({ username: '', fullName: '', email: '', password: '', confirm: '' });

  const steps = [
    { title: 'بيانات الشركة', icon: Building2 },
    { title: 'العملة والسنة المالية', icon: ShieldCheck },
    { title: 'حساب مدير النظام', icon: UserCog },
  ];

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.post('/setup/initialize', {
        company: {
          code: company.code,
          nameAr: company.nameAr,
          nameEn: company.nameEn || undefined,
          legalName: company.legalName || undefined,
          taxNumber: company.taxNumber || undefined,
          countryCode: company.countryCode,
          timezone: company.timezone,
          baseCurrency: company.baseCurrency,
          fiscalYearStartMonth: Number(company.fiscalYearStartMonth),
        },
        fiscalYear: {
          code: fy.code,
          startDate: fy.startDate,
        },
        adminUser: {
          username: admin.username,
          fullName: admin.fullName,
          email: admin.email || undefined,
          password: admin.password,
        },
      });
      toast.success('تم إعداد النظام بنجاح');
      markSetupDone();
    } catch (e) {
      setErr(e);
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="معالج التهيئة الأولية" subtitle={steps[step].title}>
      <div className="mb-6 flex items-center justify-between">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.title} className={`flex items-center gap-2 ${i === step ? 'text-indigo-600 dark:text-indigo-400 font-extrabold' : i < step ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
              <div className={`flex size-8 items-center justify-center rounded-full text-xs font-extrabold ${i === step ? 'bg-indigo-600 text-white' : i < step ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                {i < step ? '✓' : <Icon className="size-3.5" />}
              </div>
              <span className="text-xs hidden sm:inline">{s.title}</span>
            </div>
          );
        })}
      </div>

      {step === 0 && (
        <div className="space-y-3">
          <Field label="رمز الشركة" error={fieldErr(err, 'company.code')} hint="حروف وأرقام فقط (مثال: IMDAD)">
            <input className="input" dir="ltr" value={company.code} onChange={(e) => setCompany({ ...company, code: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="اسم الشركة بالعربية" error={fieldErr(err, 'company.nameAr')}>
            <input className="input" value={company.nameAr} onChange={(e) => setCompany({ ...company, nameAr: e.target.value })} />
          </Field>
          <Field label="اسم الشركة بالإنجليزية" error={fieldErr(err, 'company.nameEn')}>
            <input className="input" dir="ltr" value={company.nameEn} onChange={(e) => setCompany({ ...company, nameEn: e.target.value })} />
          </Field>
          <Field label="الرقم الضريبي (ZATCA VAT)" error={fieldErr(err, 'company.taxNumber')} hint="15 رقماً">
            <input className="input" dir="ltr" value={company.taxNumber} onChange={(e) => setCompany({ ...company, taxNumber: e.target.value })} />
          </Field>
          <button className="btn-primary w-full" disabled={!company.code || !company.nameAr} onClick={() => setStep(1)}>
            التالي
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <Field label="العملة الأساسية للمنشأة">
            <select className="input" value={company.baseCurrency} onChange={(e) => setCompany({ ...company, baseCurrency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="رمز السنة المالية">
            <input className="input" dir="ltr" value={fy.code} onChange={(e) => setFy({ ...fy, code: e.target.value })} />
          </Field>
          <Field label="تاريخ بداية السنة المالية">
            <input className="input" dir="ltr" type="date" value={fy.startDate} onChange={(e) => setFy({ ...fy, startDate: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => setStep(0)}>
              السابق
            </button>
            <button className="btn-primary flex-1" onClick={() => setStep(2)}>
              التالي
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <Field label="اسم مستخدم مدير النظام" error={fieldErr(err, 'adminUser.username')}>
            <input className="input" dir="ltr" value={admin.username} onChange={(e) => setAdmin({ ...admin, username: e.target.value })} />
          </Field>
          <Field label="الاسم الكامل" error={fieldErr(err, 'adminUser.fullName')}>
            <input className="input" value={admin.fullName} onChange={(e) => setAdmin({ ...admin, fullName: e.target.value })} />
          </Field>
          <Field label="البريد الإلكتروني" error={fieldErr(err, 'adminUser.email')}>
            <input className="input" dir="ltr" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
          </Field>
          <Field label="كلمة المرور" hint="10 أحرف على الأقل، حروف وأرقام">
            <input className="input" dir="ltr" type="password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} />
          </Field>
          <Field label="تأكيد كلمة المرور" error={admin.confirm && admin.confirm !== admin.password ? 'غير متطابقة' : undefined}>
            <input className="input" dir="ltr" type="password" value={admin.confirm} onChange={(e) => setAdmin({ ...admin, confirm: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => setStep(1)}>
              السابق
            </button>
            <button className="btn-primary flex-1" disabled={busy || !admin.username || admin.password.length < 10 || admin.password !== admin.confirm} onClick={submit}>
              {busy ? <Spinner /> : 'إكمال التهيئة والبدء'}
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}
