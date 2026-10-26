import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { ErrorState, Field, Loading, PageHeader, Spinner, useToast } from '../components/ui';

export function ZatcaOnboardingPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [otp, setOtp] = useState<string>('123456');
  const [form, setForm] = useState({
    environment: 'SIMULATION',
    vatNumber: '310123456700003',
    crNumber: '1010123456',
    egsUnitName: 'EGS-AZM-01',
    egsSerialNo: 'AZM-KSA-2026-EGS-001',
  });

  const settingsQuery = useQuery({
    queryKey: ['zatca-settings'],
    queryFn: async () => {
      const data = await api.get<any>('/zatca/settings');
      if (data) {
        setForm({
          environment: data.environment || 'SIMULATION',
          vatNumber: data.vatNumber || '310123456700003',
          crNumber: data.crNumber || '1010123456',
          egsUnitName: data.egsUnitName || 'EGS-AZM-01',
          egsSerialNo: data.egsSerialNo || 'AZM-KSA-2026-EGS-001',
        });
      }
      return data;
    },
  });

  const onboardMutation = useMutation({
    mutationFn: () =>
      api.post<any>('/zatca/onboard', {
        otp: otp.trim(),
        egsSerialNo: form.egsSerialNo,
        egsUnitName: form.egsUnitName,
        environment: form.environment,
      }),
    onSuccess: (data) => {
      toast.success(data.message || 'تم إتمام التهيئة بنجاح وإصدار شهادة CSID');
      qc.invalidateQueries({ queryKey: ['zatca-status'] });
      qc.invalidateQueries({ queryKey: ['zatca-settings'] });
      setStep(3);
    },
    onError: (e) => toast.error(e),
  });

  if (settingsQuery.isLoading) return <Loading />;
  if (settingsQuery.error) return <ErrorState error={settingsQuery.error} />;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-16">
      <PageHeader
        title="معالج تهيئة واعتماد الحل التقني (ZATCA CSID Onboarding)"
        subtitle="تسجيل وحدة الفوترة الإلكترونية (EGS) وتوليد المفاتيح المشفرة ECDSA وإصدار شهادة الامتثال والإنتاج لدى منصة فاتورة."
        actions={
          <button onClick={() => navigate('/zatca/hub')} className="btn-secondary text-sm flex items-center gap-1.5">
            <ArrowRight className="size-4" /> العودة لمركز القيادة
          </button>
        }
      />

      {/* Steps indicator */}
      <div className="flex items-center justify-between card p-4">
        {[
          { num: 1, title: 'بيانات وحدة الفوترة (EGS)' },
          { num: 2, title: 'رمز التحقق (OTP) من بوابة فاتورة' },
          { num: 3, title: 'إصدار شهادة الإنتاج (CSID)' },
        ].map((s) => (
          <div key={s.num} className="flex items-center gap-3">
            <div
              className={`size-8 rounded-full flex items-center justify-center text-xs font-bold ${
                step === s.num
                  ? 'bg-emerald-600 text-white ring-4 ring-emerald-100 dark:ring-emerald-950/60'
                  : step > s.num
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {step > s.num ? <CheckCircle2 className="size-4" /> : s.num}
            </div>
            <span
              className={`text-xs font-semibold hidden sm:inline ${
                step === s.num ? 'text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              {s.title}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: EGS Technical Configuration */}
      {step === 1 && (
        <div className="card p-6 space-y-5 animate-fade-in">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <KeyRound className="size-5 text-emerald-600" /> الخطوة 1: التحقق من بيانات المنشأة والحل التقني
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              هذه البيانات يتم تضمينها في طلب توقيع الشهادة (CSR) وإرسالها إلى هيئة الزكاة والضريبة والجمارك.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="البيئة المستهدفة للربط">
              <select
                className="input"
                value={form.environment}
                onChange={(e) => setForm({ ...form, environment: e.target.value })}
              >
                <option value="SIMULATION">بيئة المحاكاة (Simulation - ينصح بها للتجربة)</option>
                <option value="SANDBOX">بيئة التجربة للمطورين (Sandbox)</option>
                <option value="PRODUCTION">بيئة الإنتاج الحية (Production)</option>
              </select>
            </Field>

            <Field label="الرقم الضريبي للمنشأة (15 رقماً)" hint="يبدأ وينتهي بالرقم 3">
              <input
                className="input num"
                dir="ltr"
                maxLength={15}
                value={form.vatNumber}
                onChange={(e) => setForm({ ...form, vatNumber: e.target.value.replace(/\D/g, '') })}
              />
            </Field>

            <Field label="رقم السجل التجاري (CR Number)">
              <input
                className="input num"
                dir="ltr"
                value={form.crNumber}
                onChange={(e) => setForm({ ...form, crNumber: e.target.value })}
              />
            </Field>

            <Field label="اسم وحدة الفوترة (EGS Unit Name)">
              <input
                className="input"
                value={form.egsUnitName}
                onChange={(e) => setForm({ ...form, egsUnitName: e.target.value })}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field label="الرقم التسلسلي للجهاز / الحل التقني (EGS Serial Number)">
                <input
                  className="input num font-mono"
                  dir="ltr"
                  value={form.egsSerialNo}
                  onChange={(e) => setForm({ ...form, egsSerialNo: e.target.value })}
                />
              </Field>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button onClick={() => setStep(2)} className="btn-primary text-sm flex items-center gap-1.5">
              متابعة إلى خطوة OTP <ArrowLeft className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: OTP Verification & Certificate Generation */}
      {step === 2 && (
        <div className="card p-6 space-y-6 animate-fade-in">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Lock className="size-5 text-blue-600" /> الخطوة 2: إدخال رمز التحقق (OTP) من بوابة فاتورة
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              قم بتسجيل الدخول إلى بوابة فاتورة التابعة لهيئة الزكاة والضريبة والجمارك (Fatoora Portal) وتوليد رمز OTP صالح لمدة 60 دقيقة.
            </p>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-xs leading-relaxed text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            <div className="font-bold mb-1 flex items-center gap-1.5">
              <Sparkles className="size-4 text-blue-600" /> كيفية الحصول على الرمز:
            </div>
            1. ادخل إلى بوابة فاتورة: <a href="https://fatoora.zatca.gov.sa" target="_blank" rel="noreferrer" className="underline font-semibold inline-flex items-center gap-0.5">https://fatoora.zatca.gov.sa <ExternalLink className="size-3" /></a><br />
            2. اختر «إدارة الأجهزة والحلول التقنية (Onboard Solution)».<br />
            3. انقر على «توليد رمز التحقق OTP» لربط وحدة فوترة جديدة.<br />
            4. انسخ الرمز المكون من 6 أرقام وضعه في الحقل أدناه (في بيئة المحاكاة يمكنك استخدام الرمز الافتراضي 123456).
          </div>

          <Field label="رمز التحقق (OTP) - 6 أرقام" hint="صالح لمدة ساعة واحدة من تاريخ إصداره من البوابة">
            <input
              className="input num text-center tracking-widest text-2xl font-bold font-mono max-w-xs"
              dir="ltr"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
            />
          </Field>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between">
            <button onClick={() => setStep(1)} className="btn-secondary text-sm">
              السابق
            </button>
            <button
              onClick={() => onboardMutation.mutate()}
              disabled={onboardMutation.isPending || otp.length < 6}
              className="btn-primary text-sm flex items-center gap-1.5 shadow-md"
            >
              {onboardMutation.isPending ? <Spinner /> : <ShieldCheck className="size-4" />}
              توليد المفاتيح المشفرة وإصدار الشهادة (CSID)
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Success Confirmation */}
      {step === 3 && (
        <div className="card p-8 text-center space-y-6 animate-fade-in border-emerald-300 dark:border-emerald-800">
          <div className="size-16 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <ShieldCheck className="size-10" />
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              تهانينا! تم تفعيل واعتماد الحل التقني بنجاح (Production CSID)
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
              تم إصدار شهادة الإنتاج الرسمية من هيئة الزكاة والضريبة والجمارك وتوليد أزواج المفاتيح المشفرة (secp256k1). المنظومة الآن جاهزة لاعتماد كافة فواتير المبيعات فورياً.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-xs text-right max-w-md mx-auto space-y-2 dark:bg-slate-900/60 dark:border-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-500">حالة الشهادة:</span>
              <span className="font-bold text-emerald-600">شهادة إنتاج معتمدة (PRODUCTION)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">الرقم التسلسلي للحل (EGS):</span>
              <span className="font-mono font-semibold num">{form.egsSerialNo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">البيئة المعتمدة:</span>
              <span className="font-semibold">{form.environment}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">صلاحية الشهادة:</span>
              <span className="font-mono num">صالحة لمدة سنة كاملة</span>
            </div>
          </div>

          <div className="pt-2 flex justify-center gap-3">
            <button onClick={() => navigate('/zatca/hub')} className="btn-primary text-sm shadow-md">
              الذهاب إلى لوحة قيادة ZATCA
            </button>
            <button onClick={() => navigate('/zatca/invoices')} className="btn-secondary text-sm">
              استعراض فواتير المبيعات واعتمادها
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
