import { FormEvent, useState } from 'react';
import { Building2, KeyRound, ShieldCheck, UserCog } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Field, Spinner, useToast } from '../components/ui';

/** ISO currency codes offered in the wizard (reference metadata, not business data). */
const CURRENCIES = ['EGP', 'SAR', 'AED', 'USD', 'EUR', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'GBP'];

function Shell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white shadow-lg">إ</div>
          <h1 className="text-2xl font-bold">إدهام موارد بشرية المحاسبي</h1>
          <p className="text-sm text-slate-500">IDHAM HR ACCOUNTING ERP</p>
        </div>
        <div className="card p-6">
          <h2 className="mb-1 text-lg font-semibold">{title}</h2>
          {subtitle && <p className="mb-4 text-sm text-slate-500">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

const fieldErr = (e: unknown, path: string) => (e instanceof ApiError ? e.problem.errors?.find((x) => x.path === path || x.path.endsWith(`.${path}`))?.message : undefined);

export function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="تسجيل الدخول" subtitle="أدخل بيانات حسابك للمتابعة">
      <form onSubmit={submit} className="space-y-4">
        <Field label="اسم المستخدم">
          <input className="input" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
        </Field>
        <Field label="كلمة المرور">
          <input className="input" dir="ltr" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <button className="btn-primary w-full" disabled={busy || !username || !password}>
          {busy ? <Spinner /> : <KeyRound className="size-4" />} دخول
        </button>
      </form>
    </Shell>
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
      toast.success('تم تغيير كلمة المرور');
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="تغيير كلمة المرور" subtitle={forced ? 'يجب تغيير كلمة المرور قبل المتابعة' : undefined}>
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
          {busy && <Spinner />} حفظ
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
  const [company, setCompany] = useState({ code: '', nameAr: '', nameEn: '', legalName: '', taxNumber: '', countryCode: 'EG', timezone: 'Africa/Cairo', baseCurrency: 'EGP', fiscalYearStartMonth: 1 });
  const [fy, setFy] = useState({ code: `FY${year}`, startDate: `${year}-01-01` });
  const [admin, setAdmin] = useState({ username: '', fullName: '', email: '', password: '', confirm: '' });

  const steps = [
    { title: 'بيانات الشركة', icon: Building2 },
    { title: 'العملة والسنة المالية', icon: ShieldCheck },
    { title: 'حساب مدير النظام', icon: UserCog },
  ];

  const finish = async () => {
    setBusy(true);
    setErr(null);
    try {
      const opt = (v: string) => (v.trim() ? v.trim() : undefined);
      await api.post('/setup/initialize', {
        company: {
          code: company.code,
          nameAr: company.nameAr,
          nameEn: opt(company.nameEn),
          legalName: opt(company.legalName),
          taxNumber: opt(company.taxNumber),
          countryCode: opt(company.countryCode),
          timezone: company.timezone,
          baseCurrency: company.baseCurrency,
          fiscalYearStartMonth: Number(company.fiscalYearStartMonth),
        },
        firstFiscalYear: fy,
        admin: { username: admin.username, fullName: admin.fullName, email: opt(admin.email), password: admin.password },
      });
      toast.success('تم إعداد النظام بنجاح، سجّل الدخول الآن');
      markSetupDone();
    } catch (e) {
      setErr(e);
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const canNext = [
    company.code.length >= 2 && company.nameAr.length >= 2,
    !!company.baseCurrency && /^\d{4}-\d{2}-01$/.test(fy.startDate) && fy.code.length >= 2,
    admin.username.length >= 3 && admin.fullName.length >= 2 && admin.password.length >= 10 && admin.password === admin.confirm,
  ][step];

  return (
    <Shell title="الإعداد الأولي للنظام" subtitle="يتم هذا الإعداد مرة واحدة فقط. لا توجد أي بيانات تجريبية؛ كل البيانات تدخلها أنت.">
      <div className="mb-5 flex gap-2">
        {steps.map((s, i) => (
          <div key={s.title} className={`flex flex-1 items-center gap-2 rounded-lg border px-2 py-2 text-xs ${i === step ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10' : i < step ? 'border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-500 dark:border-slate-800'}`}>
            <s.icon className="size-4" /> {s.title}
          </div>
        ))}
      </div>
      {step === 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="رمز الشركة *" hint="حروف إنجليزية وأرقام" error={fieldErr(err, 'code')}>
            <input className="input" dir="ltr" value={company.code} onChange={(e) => setCompany({ ...company, code: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="اسم الشركة بالعربية *" error={fieldErr(err, 'nameAr')}>
            <input className="input" value={company.nameAr} onChange={(e) => setCompany({ ...company, nameAr: e.target.value })} />
          </Field>
          <Field label="الاسم بالإنجليزية">
            <input className="input" dir="ltr" value={company.nameEn} onChange={(e) => setCompany({ ...company, nameEn: e.target.value })} />
          </Field>
          <Field label="الاسم القانوني">
            <input className="input" value={company.legalName} onChange={(e) => setCompany({ ...company, legalName: e.target.value })} />
          </Field>
          <Field label="الرقم الضريبي">
            <input className="input" dir="ltr" value={company.taxNumber} onChange={(e) => setCompany({ ...company, taxNumber: e.target.value })} />
          </Field>
          <Field label="رمز الدولة (ISO)">
            <input className="input" dir="ltr" maxLength={2} value={company.countryCode} onChange={(e) => setCompany({ ...company, countryCode: e.target.value.toUpperCase() })} />
          </Field>
        </div>
      )}
      {step === 1 && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="العملة الأساسية *" hint="لا يمكن تغييرها بعد تسجيل قيود">
            <select className="input" value={company.baseCurrency} onChange={(e) => setCompany({ ...company, baseCurrency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="المنطقة الزمنية">
            <input className="input" dir="ltr" value={company.timezone} onChange={(e) => setCompany({ ...company, timezone: e.target.value })} />
          </Field>
          <Field label="شهر بداية السنة المالية">
            <select
              className="input"
              value={company.fiscalYearStartMonth}
              onChange={(e) => {
                const m = Number(e.target.value);
                setCompany({ ...company, fiscalYearStartMonth: m });
                setFy({ ...fy, startDate: `${year}-${String(m).padStart(2, '0')}-01` });
              }}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </select>
          </Field>
          <div />
          <Field label="رمز السنة المالية الأولى *">
            <input className="input" dir="ltr" value={fy.code} onChange={(e) => setFy({ ...fy, code: e.target.value })} />
          </Field>
          <Field label="تاريخ بداية السنة *" hint="يجب أن يكون أول يوم في الشهر">
            <input className="input" type="date" value={fy.startDate} onChange={(e) => setFy({ ...fy, startDate: e.target.value })} />
          </Field>
        </div>
      )}
      {step === 2 && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="اسم المستخدم *" error={fieldErr(err, 'username')}>
            <input className="input" dir="ltr" value={admin.username} onChange={(e) => setAdmin({ ...admin, username: e.target.value })} />
          </Field>
          <Field label="الاسم الكامل *">
            <input className="input" value={admin.fullName} onChange={(e) => setAdmin({ ...admin, fullName: e.target.value })} />
          </Field>
          <Field label="البريد الإلكتروني" className="col-span-2">
            <input className="input" dir="ltr" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
          </Field>
          <Field label="كلمة المرور *" hint="10 أحرف على الأقل، حروف وأرقام" error={fieldErr(err, 'password')}>
            <input className="input" dir="ltr" type="password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} />
          </Field>
          <Field label="تأكيد كلمة المرور *" error={admin.confirm && admin.confirm !== admin.password ? 'غير متطابقة' : undefined}>
            <input className="input" dir="ltr" type="password" value={admin.confirm} onChange={(e) => setAdmin({ ...admin, confirm: e.target.value })} />
          </Field>
        </div>
      )}
      <div className="mt-6 flex justify-between">
        <button className="btn-secondary" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>السابق</button>
        {step < 2 ? (
          <button className="btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>التالي</button>
        ) : (
          <button className="btn-primary" disabled={!canNext || busy} onClick={finish}>
            {busy && <Spinner />} إنهاء الإعداد
          </button>
        )}
      </div>
    </Shell>
  );
}
