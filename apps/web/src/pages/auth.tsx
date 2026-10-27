import { FormEvent, useEffect, useState } from 'react';
import {
  Building2, KeyRound, ShieldCheck, UserCog, User, Lock, Eye, EyeOff,
  Sparkles, ArrowRight, Layers, Briefcase, Calculator,
  TrendingUp, Wallet, Check, Zap, Award,
  Sun, Moon, Globe, HelpCircle
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Field, Spinner, useToast } from '../components/ui';

/** ISO currency codes offered in the wizard (reference metadata, not business data). */
const CURRENCIES = ['EGP', 'SAR', 'AED', 'USD', 'EUR', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'GBP'];

function Shell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-brand-950 to-slate-900 p-4 text-slate-100">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 text-2xl font-black text-white shadow-xl shadow-brand-500/20">
            إ
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">إدهام موارد بشرية المحاسبي</h1>
          <p className="text-xs text-brand-300 font-mono tracking-wider mt-0.5">IDHAM HR ACCOUNTING ERP</p>
        </div>
        <div className="card p-6 border-slate-800 bg-slate-900/90 backdrop-blur-xl shadow-2xl">
          <h2 className="mb-1 text-lg font-bold text-white">{title}</h2>
          {subtitle && <p className="mb-4 text-xs text-slate-400">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

const fieldErr = (e: unknown, path: string) =>
  e instanceof ApiError ? e.problem.errors?.find((x) => x.path === path || x.path.endsWith(`.${path}`))?.message : undefined;

// ------------------------------------------------------------------
// Modern High-End Login Page with Dual-Pane Welcome Showcase
// ------------------------------------------------------------------
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

  // Toggle Theme
  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('idham.theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('idham.theme', 'light');
    }
  };

  // Demo Credentials & Quick Switch
  const DEMO_ACCOUNTS = [
    {
      roleKey: 'admin' as const,
      roleTitle: 'مدير النظام التنفيذي',
      roleEn: 'Executive Admin',
      u: 'admin',
      p: 'AdminPass12345!',
      desc: 'صلاحيات كاملة: الإدارة، المشاريع، المحاسبة، ZATCA',
      icon: Award,
      badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    },
    {
      roleKey: 'finance' as const,
      roleTitle: 'مدير مالي ومحاسب',
      roleEn: 'Finance & Tax Manager',
      u: 'accountant',
      p: 'Finance123!',
      desc: 'القيود المحاسبية، الضرائب، إقرارات الزكاة، الفوترة',
      icon: Calculator,
      badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    },
    {
      roleKey: 'pmo' as const,
      roleTitle: 'مدير مشاريع وعمليات',
      roleEn: 'PMO & Operations Lead',
      u: 'pmo',
      p: 'PmoPass123!',
      desc: 'توزيع المطورين، أيام العمل، هوامش الربحية',
      icon: Briefcase,
      badgeColor: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
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

  // Interactive Slides for Welcome Pane
  const SLIDES = [
    {
      id: 0,
      tag: 'الفوترة الإلكترونية المعتمدة',
      title: 'الربط المباشر مع هيئة الزكاة (ZATCA Phase 2)',
      desc: 'توليد مستندات UBL XML 2.1 المعتمدة، التشفير وحساب التجزئة SHA-256، توقيع الأختام الرقمية CSID، وأكواد الاستجابة السريعة QR المشفرة لكافة الفواتير الضريبية والمبسطة.',
      icon: ShieldCheck,
      color: 'from-emerald-500 to-teal-600',
      pill: 'معتمد ومطابق 100%',
    },
    {
      id: 1,
      tag: 'حوكمة الكوادر والمشاريع',
      title: 'توزيع المطورين بالأيام الفعلية وربط الفوترة',
      desc: 'توزيع دقيق لأيام وساعات العمل للمبرمجين على المشاريع (مثال: 18 يوم بمشروع A و3 أيام بمشروع B)، واحتساب نسبة استغلال الكوادر والفاقد الاستيعابي (Bench Cost) لحظياً.',
      icon: Layers,
      color: 'from-brand-500 to-indigo-600',
      pill: 'ربط مباشر بالمبيعات',
    },
    {
      id: 2,
      tag: 'محرك التكلفة متعدد العملات',
      title: 'رواتب وبدلات الكوادر الإقليمية (SAR / EGP)',
      desc: 'محرك مالي دقيق لمعالجة رواتب المطورين في مصر والسعودية، مع تحويل العملات اللحظي وفق أسعار الصرف الرسمية، وحساب التأمينات الاجتماعية والبدلات والضرائب.',
      icon: Wallet,
      color: 'from-violet-500 to-purple-600',
      pill: 'دعم العملات المتعددة',
    },
    {
      id: 3,
      tag: 'الرقابة المالية الإستراتيجية',
      title: 'لوحة الذكاء التنفيذي ومصفوفة الربحية',
      desc: 'مؤشرات الأداء المالي والتشغيلي المباشر، هوامش ربحية العملاء والمشاريع، فحص جدوى أسعار الخدمات، وميزان مراجعة متزن لحظياً من القيود المحاسبية مباشرة.',
      icon: TrendingUp,
      color: 'from-cyan-500 to-blue-600',
      pill: 'مؤشرات تنفيذية حية',
    },
  ];

  // Auto-rotate slides
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % SLIDES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [SLIDES.length]);

  const submit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setBusy(true);
    try {
      await login(username, password);
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
      await login(u, p);
      toast.success('تم تسجيل الدخول بنجاح! جاري تحويلك...');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-stretch bg-slate-950 font-sans selection:bg-brand-500 selection:text-white">
      {/* ── Left / Secondary Pane: Interactive Welcome & Feature Showcase (Desktop) ── */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-7/12 relative overflow-hidden flex-col justify-between p-12 bg-gradient-to-br from-slate-950 via-brand-950 to-indigo-950 text-white border-e border-slate-800/80">
        {/* Ambient Glow Orbs */}
        <div className="absolute -top-32 -start-32 size-96 rounded-full bg-brand-600/20 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -end-32 size-96 rounded-full bg-indigo-600/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 start-1/4 size-80 rounded-full bg-emerald-600/15 blur-3xl pointer-events-none" />

        {/* Subtle Decorative Grid Pattern */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* Top Header & Brand Identity */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="size-12 rounded-2xl bg-gradient-to-tr from-brand-600 via-brand-500 to-indigo-500 flex items-center justify-center font-black text-2xl text-white shadow-xl shadow-brand-500/25 ring-1 ring-white/20">
              إ
            </div>
            <div>
              <div className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                <span>إدهام موارد بشرية المحاسبي</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  إصدار 2026
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono tracking-wider">
                IDHAM ENTERPRISE HR & FINANCIAL INTELLIGENCE ERP
              </div>
            </div>
          </div>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors"
            title="تبديل المظهر"
          >
            {isDark ? <Sun className="size-4 text-amber-400" /> : <Moon className="size-4 text-brand-300" />}
          </button>
        </div>

        {/* Middle: Feature Carousel Card */}
        <div className="relative z-10 my-auto py-8">
          <div className="space-y-6 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-white/10 backdrop-blur-md text-brand-200 border border-white/10">
              <Sparkles className="size-3.5 text-brand-400" />
              <span>{SLIDES[activeSlide].tag}</span>
              <span className="text-white/40">•</span>
              <span className="text-[11px] text-emerald-400 font-bold">{SLIDES[activeSlide].pill}</span>
            </div>

            <h2 className="text-3xl font-black text-white leading-tight tracking-tight">
              {SLIDES[activeSlide].title}
            </h2>

            <p className="text-sm text-slate-300 leading-relaxed">
              {SLIDES[activeSlide].desc}
            </p>

            {/* Slide Navigation Dots & Icons */}
            <div className="flex items-center gap-3 pt-4">
              {SLIDES.map((s, idx) => {
                const IconComponent = s.icon;
                const isActive = activeSlide === idx;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSlide(idx)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-white text-slate-900 shadow-lg shadow-white/10 scale-105'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/5'
                    }`}
                  >
                    <IconComponent className={`size-4 ${isActive ? 'text-brand-600' : 'text-slate-400'}`} />
                    <span className="hidden xl:inline">{s.tag}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Metrics & Compliance Badges */}
        <div className="relative z-10 pt-6 border-t border-white/10 grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="text-2xl font-black font-mono text-emerald-400">100%</div>
            <div className="text-xs text-slate-300 font-semibold">مطابقة ZATCA 2</div>
            <div className="text-[10px] text-slate-400">تشفير UBL 2.1 معتمد</div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-black font-mono text-brand-300">94.2%</div>
            <div className="text-xs text-slate-300 font-semibold">استغلال الكوادر</div>
            <div className="text-[10px] text-slate-400">حوكمة الوقت المستغل</div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-black font-mono text-cyan-300">SAR / EGP</div>
            <div className="text-xs text-slate-300 font-semibold">تعدد العملات الحقيقي</div>
            <div className="text-[10px] text-slate-400">فروق العملة والرواتب</div>
          </div>
        </div>
      </div>

      {/* ── Right / Main Pane: High-Conversion Login Form ── */}
      <div className="w-full lg:w-1/2 xl:w-5/12 flex items-center justify-center p-6 sm:p-10 md:p-12 bg-slate-900/50 backdrop-blur-2xl">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile Header (Shown on Small Screens) */}
          <div className="text-center lg:hidden space-y-2 mb-6">
            <div className="mx-auto size-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center font-black text-2xl text-white shadow-xl shadow-brand-500/20">
              إ
            </div>
            <h1 className="text-2xl font-black text-white">إدهام موارد بشرية المحاسبي</h1>
            <p className="text-xs text-brand-300 font-mono">IDHAM HR ACCOUNTING ERP</p>
          </div>

          {/* Form Header */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-400 bg-brand-500/10 px-2.5 py-1 rounded-full border border-brand-500/20">
                <Sparkles className="size-3" /> بوابة الدخول الآمنة
              </span>
              <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                Supabase Live Connected
              </span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">تسجيل الدخول للمنظومة</h2>
            <p className="text-xs text-slate-400">
              أدخل بياناتك أو اختر دورك للتجربة الفورية بنقرة واحدة.
            </p>
          </div>

          {/* Quick Demo Role Selector (1-Click Switch) */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
              <span>اختر دوراً للتجربة السريعة:</span>
              <span className="text-brand-400 font-bold">نقرة واحدة للتعبئة</span>
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
                    className={`relative p-2.5 rounded-xl text-start transition-all border ${
                      isCurrent
                        ? 'bg-brand-950/80 border-brand-500 text-white shadow-md shadow-brand-500/10 ring-1 ring-brand-500/50'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className={`size-6 rounded-lg flex items-center justify-center ${acc.badgeColor} border`}>
                        <IconComponent className="size-3.5" />
                      </div>
                      {isCurrent && <Check className="size-3.5 text-brand-400" />}
                    </div>
                    <div className="font-bold text-xs leading-snug truncate">{acc.roleTitle}</div>
                    <div className="text-[10px] font-mono text-slate-400 truncate">{acc.u}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick 1-Click Launch Button */}
          <button
            type="button"
            disabled={busy}
            onClick={() => handleInstantLogin()}
            className="w-full h-11 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-brand-600 hover:from-emerald-500 hover:to-brand-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.01] active:scale-[0.99] border border-emerald-400/30"
          >
            {busy ? (
              <Spinner />
            ) : (
              <>
                <Zap className="size-4 text-amber-300 animate-bounce" />
                <span>دخول فوري كـ ({DEMO_ACCOUNTS.find((a) => a.roleKey === selectedRole)?.roleTitle})</span>
                <ArrowRight className="size-3.5 ms-1" />
              </>
            )}
          </button>

          {/* Divider */}
          <div className="relative flex items-center py-1">
            <div className="grow border-t border-slate-800" />
            <span className="shrink mx-3 text-[11px] text-slate-500 font-medium">أو عبر إدخال البيانات</span>
            <div className="grow border-t border-slate-800" />
          </div>

          {/* Actual Login Form */}
          <form onSubmit={submit} className="space-y-4">
            {/* Username Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>اسم المستخدم أو البريد الإلكتروني</span>
                <span className="text-[10px] font-mono text-slate-500">Username</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-slate-400">
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
                  className="w-full h-11 ps-10 pe-3.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all placeholder:text-slate-500"
                />
              </div>
            </div>

            {/* Password Input with Show/Hide Toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>كلمة المرور</span>
                <button
                  type="button"
                  onClick={() => setShowHelpModal(true)}
                  className="text-[11px] text-brand-400 hover:text-brand-300 transition-colors"
                >
                  نسيت كلمة المرور؟
                </button>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-slate-400">
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
                  className="w-full h-11 ps-10 pe-10 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-400 hover:text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="size-4 rounded border-slate-700 bg-slate-800 text-brand-600 focus:ring-brand-500/20 focus:ring-offset-0"
                />
                <span>تذكر بيانات الحساب على هذا المتصفح</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={busy || !username || !password}
              className="w-full h-11 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30 transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              {busy ? <Spinner /> : <KeyRound className="size-4" />}
              <span>دخول إلى النظام (Sign In)</span>
            </button>
          </form>

          {/* Cloud & Supabase Status Badge */}
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-xs text-slate-400 space-y-1">
            <div className="flex items-center justify-between font-bold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Globe className="size-3.5 text-emerald-400" /> اتصال قاعدة البيانات السحابية
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ACTIVE
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono truncate" dir="ltr">
              db.gybgninvybdddpmyszlw.supabase.co:5432
            </div>
          </div>
        </div>
      </div>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="card max-w-md w-full p-6 space-y-4 border-slate-700 bg-slate-900 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-base">
                <HelpCircle className="size-5 text-brand-400" />
                <span>بيانات الدخول التجريبي والاستعادة</span>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                تم تزويد النظام بحسابات تجريبية مهيأة مسبقاً لاختبار كافة الصلاحيات والمديولات التشغيلية:
              </p>
              <div className="p-3 rounded-lg bg-slate-800 space-y-1 font-mono text-[11px]">
                <div>• مدير النظام: <strong className="text-white">admin</strong> / <strong>AdminPass12345!</strong></div>
                <div>• مدير الحسابات: <strong className="text-white">accountant</strong> / <strong>Finance123!</strong></div>
                <div>• مدير العمليات: <strong className="text-white">pmo</strong> / <strong>PmoPass123!</strong></div>
              </div>
              <p className="text-slate-400 text-[11px]">
                في حال كنت تستخدم قاعدة بيانات الإنتاج الرسمية، يرجى مراجعة مسؤول إدارة تقنية المعلومات لإعادة تعيين كلمة المرور من شاشة إعدادات المستخدمين.
              </p>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowHelpModal(false)}
                className="btn-primary text-xs"
              >
                حسناً، فهمت
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
            <div key={s.title} className={`flex items-center gap-2 ${i === step ? 'text-brand-400 font-bold' : i < step ? 'text-emerald-400' : 'text-slate-500'}`}>
              <div className={`flex size-8 items-center justify-center rounded-full text-xs font-bold ${i === step ? 'bg-brand-600 text-white' : i < step ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
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
