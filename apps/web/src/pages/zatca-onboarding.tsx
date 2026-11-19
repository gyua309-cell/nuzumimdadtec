import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  Cpu,
  ExternalLink,
  FileCheck2,
  KeyRound,
  Lock,
  Plus,
  Server,
  ShieldCheck,
  Wifi,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { Badge, ErrorState, Field, Loading, PageHeader, Spinner, useToast } from '../components/ui';

const STEPS = [
  { num: 1, title: 'البيئة', full: 'الخطوة 1: تحديد البيئة (Sandbox / Simulation / Production)' },
  { num: 2, title: 'جهاز EGS', full: 'الخطوة 2: تسجيل أو اختيار جهاز الفوترة الإلكترونية (EGS)' },
  { num: 3, title: 'توليد CSR', full: 'الخطوة 3: توليد طلب الشهادة (CSR) والمفتاح المشفر بالخادم' },
  { num: 4, title: 'رمز OTP', full: 'الخطوة 4: إدخال رمز OTP الصادر يدوياً من بوابة فاتورة' },
  { num: 5, title: 'الامتثال', full: 'الخطوة 5: تنفيذ اختبارات الامتثال (Compliance Checks)' },
  { num: 6, title: 'Production CSID', full: 'الخطوة 6: إصدار شهادة الإنتاج الرسمية (PCSID)' },
  { num: 7, title: 'اختبار الاتصال', full: 'الخطوة 7: اختبار الاتصال الحي والاعتماد النهائي' },
];

export function ZatcaOnboardingPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<number>(1);
  const [environment, setEnvironment] = useState<'SANDBOX' | 'SIMULATION' | 'PRODUCTION'>('SANDBOX');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(searchParams.get('deviceId') || '');
  // STRICT COMPLIANCE RULE: OTP is NEVER pre-filled or guessed! User enters it manually from Fatoora portal.
  const [otp, setOtp] = useState<string>('');
  const [csrResult, setCsrResult] = useState<any>(null);
  const [ccsidResult, setCcsidResult] = useState<any>(null);
  const [complianceResult, setComplianceResult] = useState<any>(null);
  const [pcsidResult, setPcsidResult] = useState<any>(null);
  const [testResult, setTestResult] = useState<any>(null);

  const [newDev, setNewDev] = useState({
    deviceCode: 'EGS-MAIN-02',
    deviceName: 'وحدة الفوترة الإلكترونية - الفرع الرئيسي',
    deviceType: 'ERP_CLOUD',
    vatNumber: '',
    crNumber: '',
    serialNumber: `UNIT-${new Date().getFullYear()}-01`,
    invoicingTypeCode: '1100',
  });

  const settingsQuery = useQuery({
    queryKey: ['zatca-settings'],
    queryFn: () => api.get<any>('/zatca/settings'),
  });

  const devicesQuery = useQuery({
    queryKey: ['zatca-devices', environment],
    queryFn: () => api.get<any[]>(`/zatca/devices?environment=${environment}`),
  });

  useEffect(() => {
    if (settingsQuery.data) {
      if (!searchParams.get('deviceId')) {
        setEnvironment(settingsQuery.data.environment || 'SANDBOX');
      }
      setNewDev((prev) => ({
        ...prev,
        vatNumber: prev.vatNumber || settingsQuery.data.vatNumber || '',
        crNumber: prev.crNumber || settingsQuery.data.crNumber || '',
      }));
    }
  }, [settingsQuery.data, searchParams]);

  const devices: any[] = Array.isArray(devicesQuery.data)
    ? devicesQuery.data
    : ((devicesQuery.data as any)?.data ?? []);
  const activeDevice = devices.find((d) => d.id === selectedDeviceId) || devices[0] || null;

  useEffect(() => {
    if (!selectedDeviceId && devices.length > 0) {
      setSelectedDeviceId(devices[0].id);
    }
  }, [devices, selectedDeviceId]);

  // Step 1: Save chosen environment
  const applyEnv = useMutation({
    mutationFn: () => api.put('/zatca/settings', { environment }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zatca-settings'] });
      qc.invalidateQueries({ queryKey: ['zatca-devices'] });
      setStep(2);
    },
    onError: (e) => toast.error(e),
  });

  // Step 2: Register new device
  const registerDevice = useMutation({
    mutationFn: () =>
      api.post<any>('/zatca/devices', {
        ...newDev,
        environment,
      }),
    onSuccess: (created) => {
      toast.success(`تم تسجيل الجهاز ${created.deviceName} في بيئة ${environment}`);
      setSelectedDeviceId(created.id);
      qc.invalidateQueries({ queryKey: ['zatca-devices'] });
      setStep(3);
    },
    onError: (e) => toast.error(e),
  });

  // Step 3: Generate PKCS#10 CSR
  const genCsr = useMutation({
    mutationFn: () => api.post<any>(`/zatca/devices/${activeDevice.id}/csr`, {}),
    onSuccess: (res) => {
      setCsrResult(res);
      toast.success(res.messageAr || 'تم توليد CSR والمفتاح المشفر بنجاح');
      qc.invalidateQueries({ queryKey: ['zatca-devices'] });
    },
    onError: (e) => toast.error(e),
  });

  // Step 4: Submit manual OTP -> Compliance CSID
  const reqCcsid = useMutation({
    mutationFn: () => api.post<any>(`/zatca/devices/${activeDevice.id}/compliance-csid`, { otp: otp.trim() }),
    onSuccess: (res) => {
      setCcsidResult(res);
      setOtp('');
      toast.success(res.messageAr || 'تم إصدار شهادة الامتثال (Compliance CSID) بنجاح');
      qc.invalidateQueries({ queryKey: ['zatca-devices'] });
      qc.invalidateQueries({ queryKey: ['zatca-status'] });
      setStep(5);
    },
    onError: (e) => toast.error(e),
  });

  // Step 5: Run 4 Compliance Invoice Checks
  const runChecks = useMutation({
    mutationFn: () => api.post<any>(`/zatca/devices/${activeDevice.id}/compliance-check`, {}),
    onSuccess: (res) => {
      setComplianceResult(res);
      if (res.allPassed) toast.success(res.messageAr);
      else toast.error(res.messageAr);
      qc.invalidateQueries({ queryKey: ['zatca-devices'] });
    },
    onError: (e) => toast.error(e),
  });

  // Step 6: Request Production CSID
  const reqPcsid = useMutation({
    mutationFn: () => api.post<any>(`/zatca/devices/${activeDevice.id}/production-csid`, {}),
    onSuccess: (res) => {
      setPcsidResult(res);
      toast.success(res.messageAr || 'تم إصدار شهادة الإنتاج الرسمية (PCSID) بنجاح');
      qc.invalidateQueries({ queryKey: ['zatca-devices'] });
      qc.invalidateQueries({ queryKey: ['zatca-status'] });
      setStep(7);
    },
    onError: (e) => toast.error(e),
  });

  // Step 7: Live Connection Test
  const runTest = useMutation({
    mutationFn: () => api.post<any>(`/zatca/devices/${activeDevice.id}/test`, {}),
    onSuccess: (res) => {
      setTestResult(res);
      if (res.reachable && res.authenticated) toast.success('اختبار الاتصال ناجح بالكامل!');
      else toast.error(res.messageAr || 'تنبيه في الاتصال');
      qc.invalidateQueries({ queryKey: ['zatca-status'] });
      qc.invalidateQueries({ queryKey: ['zatca-devices'] });
    },
    onError: (e) => toast.error(e),
  });

  if (settingsQuery.isLoading) return <Loading />;
  if (settingsQuery.error) return <ErrorState error={settingsQuery.error} />;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-16">
      <PageHeader
        title="معالج الربط وإصدار الشهادات الرقمية (ZATCA Onboarding — 7 خطوات)"
        subtitle="إعداد كامل ومنظم للربط مع منظومة فاتورة المرحلة الثانية: اختيار البيئة، تسجيل EGS، توليد CSR، إدخال OTP يدوياً، اختبارات الامتثال، شهادة الإنتاج PCSID، واختبار الاتصال."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/zatca/settings" className="btn-secondary text-sm">
              إعدادات المنشأة
            </Link>
            <button onClick={() => navigate('/zatca/hub')} className="btn-secondary text-sm">
              <ArrowRight className="size-4" /> العودة للوحة التحكم
            </button>
          </div>
        }
      />

      {/* 7-Step Visual Stepper */}
      <div className="card p-4 overflow-x-auto">
        <div className="flex items-center justify-between gap-2 min-w-[680px]">
          {STEPS.map((s) => {
            const active = step === s.num;
            const done = step > s.num;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => setStep(s.num)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold transition-all ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : done
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-800/70 dark:text-slate-300'
                }`}
              >
                <span
                  className={`size-6 rounded-full flex items-center justify-center text-[11px] font-black ${
                    active
                      ? 'bg-white text-indigo-700'
                      : done
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                  }`}
                >
                  {done ? '✓' : s.num}
                </span>
                <span>{s.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Step Banner */}
      <div className="text-sm font-extrabold text-indigo-700 dark:text-indigo-300 flex items-center gap-2 px-1">
        <ShieldCheck className="size-4" />
        <span>{STEPS[step - 1]?.full}</span>
      </div>

      {/* STEP 1: Environment */}
      {step === 1 && (
        <div className="card p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                id: 'SANDBOX' as const,
                title: 'Developer Portal / Sandbox',
                badge: 'تجريبية',
                desc: 'بيئة التطوير والاختبارات الأولية. لا تؤثر على إقرارات المنشأة الفعلية.',
              },
              {
                id: 'SIMULATION' as const,
                title: 'بيئة المحاكاة (Simulation)',
                badge: 'محاكاة',
                desc: 'مطابقة تماماً لبيئة الإنتاج لاختبار الفواتير قبل التفعيل النهائي.',
              },
              {
                id: 'PRODUCTION' as const,
                title: 'بيئة الإنتاج الرسمية (Production)',
                badge: 'إنتاج حي',
                desc: 'ربط مباشر رسمي مع بوابة فاتورة لإصدار الفواتير الضريبية الملزمة قانوناً.',
              },
            ].map((env) => (
              <button
                key={env.id}
                type="button"
                onClick={() => setEnvironment(env.id)}
                className={`rounded-2xl border p-5 text-right transition-all space-y-2 ${
                  environment === env.id
                    ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-200 dark:bg-indigo-950/40 dark:ring-indigo-900'
                    : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Server className="size-5 text-indigo-600" />
                  <Badge color={env.id === 'PRODUCTION' ? 'green' : env.id === 'SIMULATION' ? 'blue' : 'amber'}>
                    {env.badge}
                  </Badge>
                </div>
                <div className="text-base font-extrabold text-slate-900 dark:text-white">{env.title}</div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed">{env.desc}</p>
              </button>
            ))}
          </div>

          {environment === 'PRODUCTION' && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs font-bold text-rose-900 dark:border-rose-900 dark:bg-rose-950/35 dark:text-rose-200 flex items-start gap-2.5">
              <AlertTriangle className="size-4 shrink-0 mt-0.5 text-rose-600" />
              <span>
                تنبيه مهم: لقد اخترت بيئة الإنتاج الحية (Production). تأكد من صحة الرقم الضريبي للمنشأة والعنوان الوطني السعودي بالكامل قبل توليد الشهادة، وأنك تستخدم رمز OTP الصادر من بوابة فاتورة الفعلية.
              </span>
            </div>
          )}

          <div className="flex justify-end">
            <button className="btn-primary" disabled={applyEnv.isPending} onClick={() => applyEnv.mutate()}>
              {applyEnv.isPending ? <Spinner /> : null}
              حفظ البيئة والانتقال لتسجيل الجهاز (EGS)
              <ArrowLeft className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: EGS Device */}
      {step === 2 && (
        <div className="space-y-5">
          {devices.length > 0 && (
            <div className="card p-5 space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                الأجهزة المسجلة حالياً في بيئة {environment}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {devices.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDeviceId(d.id)}
                    className={`rounded-xl border p-4 text-right transition-all ${
                      activeDevice?.id === d.id
                        ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-200 dark:bg-emerald-950/30'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-white">{d.deviceName}</span>
                      <Badge color={d.certificateStatus === 'PRODUCTION' ? 'green' : 'blue'}>{d.certificateStatus}</Badge>
                    </div>
                    <div className="text-xs font-mono text-slate-600 dark:text-slate-300 mt-1">{d.serialNumber}</div>
                  </button>
                ))}
              </div>
              <div className="flex justify-between pt-2">
                <button className="btn-secondary" onClick={() => setStep(1)}>
                  <ArrowRight className="size-4" /> السابق
                </button>
                <button className="btn-primary" disabled={!activeDevice} onClick={() => setStep(3)}>
                  المتابعة بالجهاز المحدد
                  <ArrowLeft className="size-4" />
                </button>
              </div>
            </div>
          )}

          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="size-4 text-indigo-600" />
              أو تسجيل وحدة فوترة إلكترونية جديدة (EGS) في بيئة {environment}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="اسم الجهاز" required>
                <input
                  className="input"
                  value={newDev.deviceName}
                  onChange={(e) => setNewDev({ ...newDev, deviceName: e.target.value })}
                />
              </Field>
              <Field label="رمز الجهاز (Device ID)" required>
                <input
                  className="input font-mono"
                  dir="ltr"
                  value={newDev.deviceCode}
                  onChange={(e) => setNewDev({ ...newDev, deviceCode: e.target.value })}
                />
              </Field>
              <Field label="الرقم التسلسلي" required>
                <input
                  className="input font-mono"
                  dir="ltr"
                  value={newDev.serialNumber}
                  onChange={(e) => setNewDev({ ...newDev, serialNumber: e.target.value })}
                />
              </Field>
              <Field label="الرقم الضريبي (15 رقماً)" required>
                <input
                  className="input font-mono"
                  dir="ltr"
                  maxLength={15}
                  value={newDev.vatNumber}
                  onChange={(e) => setNewDev({ ...newDev, vatNumber: e.target.value })}
                />
              </Field>
              <Field label="نوع الجهاز">
                <select
                  className="input"
                  value={newDev.deviceType}
                  onChange={(e) => setNewDev({ ...newDev, deviceType: e.target.value })}
                >
                  <option value="ERP_CLOUD">نظام محاسبي (ERP)</option>
                  <option value="POS">نقطة بيع (POS)</option>
                  <option value="BRANCH_TERMINAL">وحدة فرع</option>
                  <option value="API_GATEWAY">بوابة API</option>
                </select>
              </Field>
              <Field label="نطاق فواتير الجهاز">
                <select
                  className="input"
                  value={newDev.invoicingTypeCode}
                  onChange={(e) => setNewDev({ ...newDev, invoicingTypeCode: e.target.value })}
                >
                  <option value="1100">1100 — قياسية ومبسطة</option>
                  <option value="1000">1000 — قياسية فقط (B2B)</option>
                  <option value="0100">0100 — مبسطة فقط (B2C)</option>
                </select>
              </Field>
            </div>
            <div className="flex justify-end">
              <button
                className="btn-primary"
                disabled={registerDevice.isPending || !newDev.deviceName || !newDev.deviceCode || !newDev.vatNumber}
                onClick={() => registerDevice.mutate()}
              >
                {registerDevice.isPending ? <Spinner /> : <Cpu className="size-4" />}
                تسجيل الجهاز والانتقال لتوليد CSR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Generate PKCS#10 CSR */}
      {step === 3 && (
        <div className="card p-6 space-y-5">
          {!activeDevice ? (
            <div className="text-sm font-bold text-amber-700">يرجى العودة للخطوة 2 لاختيار أو تسجيل جهاز EGS أولاً.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 p-4">
                <div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">{activeDevice.deviceName}</div>
                  <div className="text-xs font-mono text-slate-600 dark:text-slate-300 mt-0.5">
                    {activeDevice.serialNumber} • البيئة: {activeDevice.environment}
                  </div>
                </div>
                <Badge color={activeDevice.hasCsr ? 'green' : 'amber'}>
                  {activeDevice.hasCsr ? 'CSR جاهز ومفتاح مشفر ✓' : 'لم يُولّد CSR بعد'}
                </Badge>
              </div>

              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 text-xs font-semibold text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/30 flex items-start gap-2.5">
                <Lock className="size-4 shrink-0 mt-0.5 text-indigo-600" />
                <span>
                  يتم توليد زوج مفاتيح ECDSA (secp256k1) وطلب شهادة PKCS#10 CSR المتوافق مع OID هيئة الزكاة على الخادم مباشرة، ويُحفظ المفتاح الخاص مشفراً بـ AES-256-GCM دون إرساله للمتصفح نهائياً.
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button className="btn-primary" disabled={genCsr.isPending} onClick={() => genCsr.mutate()}>
                  {genCsr.isPending ? <Spinner /> : <KeyRound className="size-4" />}
                  {activeDevice.hasCsr ? 'إعادة توليد CSR ومفاتيح جديدة' : 'توليد طلب الشهادة (CSR) الآن'}
                </button>
              </div>

              {(csrResult?.csrPem || activeDevice.csrPem) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                      محتوى طلب الشهادة (PEM PKCS#10 CSR)
                    </span>
                    <button
                      className="btn-secondary text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(csrResult?.csrPem || activeDevice.csrPem);
                        toast.success('تم نسخ CSR بنجاح');
                      }}
                    >
                      <Copy className="size-3.5" /> نسخ CSR
                    </button>
                  </div>
                  <pre
                    dir="ltr"
                    className="rounded-xl bg-slate-950 text-emerald-400 p-4 text-[11px] font-mono overflow-x-auto max-h-48"
                  >
                    {csrResult?.csrPem || activeDevice.csrPem}
                  </pre>
                </div>
              )}

              <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <button className="btn-secondary" onClick={() => setStep(2)}>
                  <ArrowRight className="size-4" /> السابق
                </button>
                <button
                  className="btn-primary"
                  disabled={!activeDevice.hasCsr && !csrResult}
                  onClick={() => setStep(4)}
                >
                  التالي: إدخال رمز OTP
                  <ArrowLeft className="size-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* STEP 4: Manual OTP Input (NEVER pre-filled) */}
      {step === 4 && (
        <div className="card p-6 space-y-5">
          <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 dark:border-amber-800 dark:bg-amber-950/35 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-amber-950 dark:text-amber-200">
                إدخال رمز التحقق المؤقت (OTP) من بوابة فاتورة
              </span>
              <a
                href="https://fatoora.zatca.gov.sa"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-extrabold text-indigo-700 hover:underline dark:text-indigo-300"
              >
                فتح بوابة فاتورة الرسمية <ExternalLink className="size-3.5" />
              </a>
            </div>
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 leading-relaxed">
              سجّل الدخول إلى بوابة فاتورة ← ربط وحدة حل تقني جديدة ← انسخ رمز OTP المكوّن من 6 أرقام وأدخله يدوياً أدناه. لا يقوم النظام بتخمين أو تعبئة OTP تلقائياً التزاماً بضوابط الأمان.
            </p>
          </div>

          <div className="max-w-md mx-auto space-y-4 py-2">
            <Field label="رمز التحقق OTP من بوابة فاتورة (6 أرقام)" required>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                dir="ltr"
                autoComplete="one-time-code"
                placeholder="أدخل 6 أرقام يدوياً..."
                className="input text-center text-2xl font-mono font-black tracking-[0.5em] py-3"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </Field>
            <button
              className="btn-primary w-full justify-center py-3 text-sm"
              disabled={reqCcsid.isPending || otp.length !== 6 || !activeDevice}
              onClick={() => reqCcsid.mutate()}
            >
              {reqCcsid.isPending ? <Spinner /> : <ShieldCheck className="size-4" />}
              إرسال CSR + OTP وإصدار شهادة الامتثال (Compliance CSID)
            </button>
          </div>

          {ccsidResult && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 text-xs font-bold text-emerald-900">
              تم إصدار شهادة الامتثال بنجاح — Request ID: <span className="font-mono">{ccsidResult.complianceRequestId}</span>
            </div>
          )}

          <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <button className="btn-secondary" onClick={() => setStep(3)}>
              <ArrowRight className="size-4" /> السابق
            </button>
            <button
              className="btn-secondary"
              disabled={!activeDevice?.hasComplianceCsid && !ccsidResult}
              onClick={() => setStep(5)}
            >
              الانتقال لاختبارات الامتثال
              <ArrowLeft className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Compliance Invoice Checks */}
      {step === 5 && (
        <div className="card p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                تنفيذ اختبارات الامتثال الإلزامية (ZATCA Compliance Invoices)
              </h3>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                يقوم النظام بإرسال عينات موقعة UBL 2.1 عبر نقطة `/compliance/invoices` لجميع الأنواع الأربعة (قياسية، مبسطة، إشعار دائن، إشعار مدين)
              </p>
            </div>
            <button
              className="btn-primary"
              disabled={runChecks.isPending || !activeDevice}
              onClick={() => runChecks.mutate()}
            >
              {runChecks.isPending ? <Spinner /> : <FileCheck2 className="size-4" />}
              تشغيل اختبارات الامتثال الآن
            </button>
          </div>

          {(() => {
            const checksObj = complianceResult?.checks || activeDevice?.complianceChecksPassed || {};
            const entries = Object.entries(checksObj);
            if (entries.length === 0) {
              return (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">
                  اضغط على «تشغيل اختبارات الامتثال الآن» للتحقق من الفاتورة القياسية والمبسطة والإشعار الدائن والمدين لدى الهيئة.
                </div>
              );
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {entries.map(([key, c]: [string, any]) => (
                  <div
                    key={key}
                    className={`rounded-xl border p-4 flex items-start gap-3 ${
                      c.passed
                        ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/25'
                        : 'border-rose-200 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/25'
                    }`}
                  >
                    {c.passed ? (
                      <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="size-5 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-slate-900 dark:text-white">{c.labelAr || key}</div>
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5">{c.messageAr}</div>
                      <div className="text-[11px] font-mono text-slate-500 mt-1">
                        HTTP {c.httpStatus} • {c.responseCode}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <button className="btn-secondary" onClick={() => setStep(4)}>
              <ArrowRight className="size-4" /> السابق
            </button>
            <button className="btn-primary" onClick={() => setStep(6)}>
              التالي: إصدار شهادة الإنتاج (PCSID)
              <ArrowLeft className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 6: Production CSID */}
      {step === 6 && (
        <div className="card p-6 space-y-5">
          <div className="space-y-2">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              إصدار شهادة الإنتاج المعتمدة (Production CSID)
            </h3>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
              بعد اجتياز اختبارات الامتثال، يتم إرسال `compliance_request_id` إلى نقطة `/production/csids` لاستلام شهادة الإنتاج الرسمية (PCSID) وتشفيرها وحفظها في خزنة الخادم.
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs space-y-1">
              <div className="font-bold text-slate-500">رقم طلب الامتثال المرجعي (Compliance Request ID)</div>
              <div className="font-mono text-sm font-extrabold text-slate-900 dark:text-white">
                {activeDevice?.complianceRequestId || ccsidResult?.complianceRequestId || 'غير متوفر بعد'}
              </div>
            </div>
            <button
              className="btn-primary"
              disabled={reqPcsid.isPending || !activeDevice}
              onClick={() => reqPcsid.mutate()}
            >
              {reqPcsid.isPending ? <Spinner /> : <ShieldCheck className="size-4" />}
              إصدار شهادة الإنتاج (Production CSID) الآن
            </button>
          </div>

          {(pcsidResult || activeDevice?.hasProductionCsid) && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 text-xs font-bold text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200 flex items-center gap-2.5">
              <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
              <span>
                شهادة الإنتاج (PCSID) مفعّلة ومشفّرة على الخادم — صالحة حتى{' '}
                {String(pcsidResult?.expiresAt || activeDevice?.csidExpiresAt || '').slice(0, 10) || 'سنة كاملة'}.
              </span>
            </div>
          )}

          <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <button className="btn-secondary" onClick={() => setStep(5)}>
              <ArrowRight className="size-4" /> السابق
            </button>
            <button className="btn-primary" onClick={() => setStep(7)}>
              التالي: اختبار الاتصال النهائي
              <ArrowLeft className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 7: Live Connection Test */}
      {step === 7 && (
        <div className="card p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                اختبار الاتصال الحي والتحقق النهائي من الجاهزية
              </h3>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                فحص الاتصال ببوابة فاتورة، صلاحية المصادقة، حالة الشهادة، الجهاز، والبيئة النشطة
              </p>
            </div>
            <button className="btn-primary" disabled={runTest.isPending || !activeDevice} onClick={() => runTest.mutate()}>
              {runTest.isPending ? <Spinner /> : <Wifi className="size-4" />}
              تشغيل اختبار الاتصال الآن
            </button>
          </div>

          {testResult && (
            <div
              className={`rounded-2xl border p-5 space-y-3 ${
                testResult.reachable && testResult.authenticated
                  ? 'border-emerald-300 bg-emerald-50/75 dark:border-emerald-800 dark:bg-emerald-950/35'
                  : 'border-amber-300 bg-amber-50/75 dark:border-amber-800 dark:bg-amber-950/35'
              }`}
            >
              <div className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-white">
                {testResult.reachable && testResult.authenticated ? (
                  <CheckCircle2 className="size-5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="size-5 text-amber-600" />
                )}
                <span>{testResult.messageAr}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
                <div className="rounded-xl bg-white/80 dark:bg-slate-900/70 p-3">
                  <div className="text-slate-500">البيئة</div>
                  <div className="font-extrabold mt-0.5">{testResult.environment}</div>
                </div>
                <div className="rounded-xl bg-white/80 dark:bg-slate-900/70 p-3">
                  <div className="text-slate-500">حالة الشهادة</div>
                  <div className="font-extrabold mt-0.5">{testResult.certificateStatus}</div>
                </div>
                <div className="rounded-xl bg-white/80 dark:bg-slate-900/70 p-3">
                  <div className="text-slate-500">زمن الاستجابة</div>
                  <div className="font-mono font-extrabold mt-0.5">{testResult.latencyMs ?? 0} ms</div>
                </div>
                <div className="rounded-xl bg-white/80 dark:bg-slate-900/70 p-3">
                  <div className="text-slate-500">حالة المصادقة</div>
                  <div className="font-extrabold mt-0.5">{testResult.authenticated ? 'مصادق عليه ✓' : 'غير مكتمل'}</div>
                </div>
              </div>
              <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300" dir="ltr">
                Endpoint: {testResult.endpoint}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button className="btn-secondary" onClick={() => setStep(6)}>
              <ArrowRight className="size-4" /> السابق
            </button>
            <div className="flex items-center gap-2">
              <Link to="/zatca/hub" className="btn-secondary">لوحة التحكم</Link>
              <Link to="/zatca/invoices" className="btn-primary">الانتقال إلى الفواتير الإلكترونية</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
