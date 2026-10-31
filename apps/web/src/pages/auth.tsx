import { FormEvent, useEffect, useState } from 'react';
import {
  Building2, KeyRound, ShieldCheck, UserCog, User, Lock, Eye, EyeOff,
  Sparkles, ArrowRight, Layers, Briefcase, Calculator,
  TrendingUp, Wallet, Check, Zap, Award,
  Sun, Moon, Globe, HelpCircle,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Field, Modal, Spinner, useToast } from '../components/ui';

/** ISO currency codes offered in the wizard (reference metadata, not business data). */
const CURRENCIES = ['EGP', 'SAR', 'AED', 'USD', 'EUR', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'GBP'];

function Shell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f6fb] dark:bg-[#070b14] p-4 text-slate-900 dark:text-slate-100">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <div className="hazard-badge mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl border border-amber-500/40 shadow-lg" />
          <div className="inline-flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">IDHAM ERP</h1>
            <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:text-amber-400 border border-amber-500/30">
              PRO
            </span>
          </div>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">
            نظام الموارد البشرية والمحاسبة المتكامل
          </p>
        </div>
        <div className="card cyber-card-amber p-6 shadow-xl">
          <h2 className="mb-1 text-lg font-extrabold text-slate-900 dark:text-white">{title}</h2>
          {subtitle && <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
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
      u: 'admin',
      p: 'AdminPass12345!',
      icon: Award,
      badgeColor: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
    },
    {
      roleKey: 'finance' as const,
      roleTitle: 'مدير مالي ومحاسب',
      u: 'accountant',
      p: 'Finance123!',
      icon: Calculator,
      badgeColor: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    },
    {
      roleKey: 'pmo' as const,
      roleTitle: 'مدير مشاريع وعمليات',
      u: 'pmo',
      p: 'PmoPass123!',
      icon: Briefcase,
      badgeColor: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30',
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
      tag: 'الفوترة الإلكترونية المعتمدة',
      title: 'الربط المباشر مع هيئة الزكاة (ZATCA Phase 2)',
      desc: 'توليد مستندات UBL XML 2.1 المعتمدة، التشفير وحساب التجزئة SHA-256، توقيع الأختام الرقمية CSID، وأكواد الاستجابة السريعة QR بصيغة TLV لكافة الفواتير الضريبية والمبسطة.',
      icon: ShieldCheck,
      pill: 'معتمد ومطابق 100%',
    },
    {
      id: 1,
      tag: 'حوكمة الكوادر والمشاريع',
      title: 'توزيع الكوادر بالأيام الفعلية وربط الفوترة',
      desc: 'توزيع دقيق لأيام وساعات العمل للكوادر على المشاريع، واحتساب نسبة استغلال الكوادر والفاقد الاستيعابي (Bench Cost) لحظياً مع ربط مباشر بفواتير المبيعات.',
      icon: Layers,
      pill: 'ربط مباشر بالمبيعات',
    },
    {
      id: 2,
      tag: 'محرك التكلفة متعدد العملات',
      title: 'رواتب وبدلات وعهد الفروع الإقليمية (SAR / EGP)',
      desc: 'محرك مالي دقيق لمعالجة رواتب الكوادر وعهد الفروع في السعودية ومصر، مع تحويل العملات وفق أسعار الصرف المعتمدة، وحساب مكافأة نهاية الخدمة والتأمينات.',
      icon: Wallet,
      pill: 'دعم العملات المتعددة',
    },
    {
      id: 3,
      tag: 'الرقابة المالية الإستراتيجية',
      title: 'لوحة المؤشرات التنفيذية ومصفوفة الربحية',
      desc: 'مؤشرات الأداء المالي والتشغيلي الحية، هوامش ربحية العملاء والمشاريع، وميزان مراجعة متزن لحظياً من القيود المحاسبية مباشرة مع محرك طباعة وتصدير موحد.',
      icon: TrendingUp,
      pill: 'مؤشرات تنفيذية حية',
    },
  ];

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
    <div className="min-h-screen w-full flex items-stretch bg-[#f3f6fb] dark:bg-[#070b14] text-slate-900 dark:text-slate-100 font-sans">
      {/* ── Left / Showcase Pane: Obsidian Cyber Executive Identity (Desktop) ── */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-7/12 relative overflow-hidden flex-col justify-between p-12 bg-[#070b14] text-white border-e border-slate-800">
        {/* Ambient Cyber Glow Orbs */}
        <div className="absolute -top-32 -start-32 size-96 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 -end-32 size-96 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 start-1/4 size-80 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />

        {/* Subtle Grid Pattern */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Top Header & IDHAM Hazard Brand Identity */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="hazard-badge size-12 rounded-2xl border border-amber-500/40 shadow-xl" />
            <div>
              <div className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                <span>IDHAM ERP</span>
                <span className="text-[10px] px-2 py-0.5 rounded-md font-black bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  PRO 2026
                </span>
              </div>
              <div className="text-xs font-bold text-slate-400 mt-0.5">
                منظومة الموارد البشرية والمحاسبة المتكاملة (السعودية ومصر)
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-200 border border-white/10 transition-colors cursor-pointer"
            title="تبديل المظهر الليلي / النهاري"
          >
            {isDark ? (
              <>
                <Sun className="size-4 text-amber-400" />
                <span>الوضع النهاري</span>
              </>
            ) : (
              <>
                <Moon className="size-4 text-cyan-400" />
                <span>الوضع الليلي</span>
              </>
            )}
          </button>
        </div>

        {/* Middle: Feature Carousel Card */}
        <div className="relative z-10 my-auto py-8">
          <div className="rounded-3xl border border-slate-800/90 bg-[#0c1427]/90 p-8 shadow-2xl backdrop-blur-md space-y-5 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
              <Sparkles className="size-3.5 text-amber-400" />
              <span>{SLIDES[activeSlide].tag}</span>
              <span className="text-white/30">•</span>
              <span className="text-[11px] text-emerald-400 font-extrabold">{SLIDES[activeSlide].pill}</span>
            </div>

            <h2 className="text-2xl xl:text-3xl font-black text-white leading-tight tracking-tight">
              {SLIDES[activeSlide].title}
            </h2>

            <p className="text-sm text-slate-300 leading-relaxed">
              {SLIDES[activeSlide].desc}
            </p>

            {/* Slide Navigation Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {SLIDES.map((s, idx) => {
                const IconComponent = s.icon;
                const isActive = activeSlide === idx;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveSlide(idx)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-slate-950 shadow-md'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10'
                    }`}
                  >
                    <IconComponent className={`size-4 ${isActive ? 'text-slate-950' : 'text-cyan-400'}`} />
                    <span className="hidden xl:inline">{s.tag}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Compliance Pillars */}
        <div className="relative z-10 pt-6 border-t border-slate-800/80 grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="text-xl font-black font-mono text-emerald-400">ZATCA Phase 2</div>
            <div className="text-xs text-slate-300 font-bold">الفوترة الإلكترونية</div>
            <div className="text-[11px] text-slate-400">UBL 2.1 + TLV QR معتمد</div>
          </div>
          <div className="space-y-1">
            <div className="text-xl font-black font-mono text-amber-400">HR & PMO</div>
            <div className="text-xs text-slate-300 font-bold">حوكمة الكوادر والمشاريع</div>
            <div className="text-[11px] text-slate-400">تتبع الأيام والربحية الفعلية</div>
          </div>
          <div className="space-y-1">
            <div className="text-xl font-black font-mono text-cyan-400">SAR / EGP</div>
            <div className="text-xs text-slate-300 font-bold">تعدد العملات والفروع</div>
            <div className="text-[11px] text-slate-400">رواتب وعهد وميزان متوازن</div>
          </div>
        </div>
      </div>

      {/* ── Right / Main Pane: Dual-Mode Executive Login Card ── */}
      <div className="w-full lg:w-1/2 xl:w-5/12 flex items-center justify-center p-5 sm:p-10 bg-[#f3f6fb] dark:bg-[#070b14]">
        <div className="w-full max-w-md space-y-5">
          {/* Mobile Header */}
          <div className="flex items-center justify-between lg:hidden mb-4">
            <div className="flex items-center gap-2.5">
              <div className="hazard-badge size-11 rounded-xl border border-amber-500/40 shadow-md" />
              <div>
                <div className="text-lg font-black text-slate-900 dark:text-white">IDHAM ERP</div>
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">نظام الموارد البشرية والمحاسبة</div>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="btn-secondary text-xs px-2.5 py-1.5"
            >
              {isDark ? <Sun className="size-4 text-amber-400" /> : <Moon className="size-4 text-amber-600" />}
            </button>
          </div>

          <div className="card cyber-card-cyan p-6 sm:p-7 space-y-5">
            {/* Form Header */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-amber-700 dark:text-amber-400 bg-amber-500/12 px-2.5 py-1 rounded-full border border-amber-500/25">
                  <Sparkles className="size-3" /> بوابة الدخول الآمنة
                </span>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 font-extrabold">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  متصل سحابياً
                </span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight pt-1">
                تسجيل الدخول للمنظومة
              </h2>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                أدخل بيانات حسابك أو اختر الدور للدخول السريع بنقرة واحدة.
              </p>
            </div>

            {/* Quick Role Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-bold">
                <span>اختيار سريع للدور الوظيفي:</span>
                <span className="text-cyan-700 dark:text-cyan-400">تعبئة تلقائية</span>
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
                      className={`relative p-2.5 rounded-xl text-start transition-all border cursor-pointer ${
                        isCurrent
                          ? 'bg-amber-500/10 border-amber-500 text-slate-900 dark:text-white shadow-xs ring-1 ring-amber-500/30'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-[#080d1a] dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className={`size-6 rounded-lg flex items-center justify-center ${acc.badgeColor} border`}>
                          <IconComponent className="size-3.5" />
                        </div>
                        {isCurrent && <Check className="size-3.5 text-amber-600 dark:text-amber-400" />}
                      </div>
                      <div className="font-extrabold text-[11px] leading-snug truncate">{acc.roleTitle}</div>
                      <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">{acc.u}</div>
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
              className="btn-primary w-full h-11 text-xs font-black gap-2"
            >
              {busy ? (
                <Spinner />
              ) : (
                <>
                  <Zap className="size-4" />
                  <span>دخول فوري كـ ({DEMO_ACCOUNTS.find((a) => a.roleKey === selectedRole)?.roleTitle})</span>
                  <ArrowRight className="size-3.5 ms-1" />
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative flex items-center py-0.5">
              <div className="grow border-t border-slate-200 dark:border-slate-800" />
              <span className="shrink mx-3 text-[11px] text-slate-400 font-bold">أو تسجيل الدخول اليدوي</span>
              <div className="grow border-t border-slate-200 dark:border-slate-800" />
            </div>

            {/* Login Form */}
            <form onSubmit={submit} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>اسم المستخدم أو البريد الإلكتروني</span>
                  <span className="text-[10px] font-mono text-slate-400">Username</span>
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
                    className="input h-10 ps-10 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>كلمة المرور</span>
                  <button
                    type="button"
                    onClick={() => setShowHelpModal(true)}
                    className="text-[11px] font-bold text-cyan-700 hover:underline dark:text-cyan-400 cursor-pointer"
                  >
                    مساعدة في الدخول؟
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
                    className="input h-10 ps-10 pe-10 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-0.5">
                <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-400 font-semibold select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="size-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800"
                  />
                  <span>تذكر بيانات الجلسة على هذا الجهاز</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={busy || !username || !password}
                className="btn-secondary w-full h-10 text-xs font-extrabold gap-2 border-cyan-500/40 text-cyan-800 hover:bg-cyan-50/70 dark:text-cyan-300 dark:hover:bg-cyan-950/30"
              >
                {busy ? <Spinner /> : <KeyRound className="size-4" />}
                <span>تسجيل الدخول بالبيانات أعلاه</span>
              </button>
            </form>
          </div>

          {/* Cloud & Supabase Status Footer */}
          <div className="card px-4 py-3 flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 font-bold text-slate-600 dark:text-slate-300">
              <Globe className="size-3.5 text-emerald-500" />
              <span>اتصال قاعدة البيانات السحابية (Supabase)</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-md font-mono font-bold bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25">
              ONLINE
            </span>
          </div>
        </div>
      </div>

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
            <HelpCircle className="size-4 text-cyan-500" />
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
            <div key={s.title} className={`flex items-center gap-2 ${i === step ? 'text-amber-600 dark:text-amber-400 font-extrabold' : i < step ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
              <div className={`flex size-8 items-center justify-center rounded-full text-xs font-extrabold ${i === step ? 'bg-amber-500 text-slate-950' : i < step ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
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
