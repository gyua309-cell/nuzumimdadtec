import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  Cpu,
  Globe,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import { Badge, ErrorState, Field, Loading, Modal, PageHeader, Spinner, useToast } from '../components/ui';

type SettingsTab = 'ORG' | 'DEVICES' | 'GATEWAY';

const CERT_COLOR: Record<string, 'green' | 'blue' | 'amber' | 'red' | 'slate'> = {
  PRODUCTION: 'green',
  COMPLIANCE: 'blue',
  CSR_GENERATED: 'amber',
  NOT_ONBOARDED: 'slate',
  EXPIRED: 'red',
  REVOKED: 'red',
};

export function ZatcaSettingsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<SettingsTab>('ORG');
  const [envFilter, setEnvFilter] = useState<string>('ALL');
  const [showNewDevice, setShowNewDevice] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ['zatca-settings'],
    queryFn: () => api.get<any>('/zatca/settings'),
  });

  const devicesQuery = useQuery({
    queryKey: ['zatca-devices', envFilter],
    queryFn: () => api.get<any[]>(`/zatca/devices${envFilter !== 'ALL' ? `?environment=${envFilter}` : ''}`),
  });

  const branchesQuery = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => api.get<any>('/branches'),
  });

  const [form, setForm] = useState<any>({});
  useEffect(() => {
    if (settingsQuery.data) {
      setForm({
        environment: settingsQuery.data.environment || 'SANDBOX',
        organizationNameAr: settingsQuery.data.organizationNameAr || '',
        organizationNameEn: settingsQuery.data.organizationNameEn || '',
        vatNumber: settingsQuery.data.vatNumber || '',
        crNumber: settingsQuery.data.crNumber || '',
        buildingNumber: settingsQuery.data.buildingNumber || '',
        streetName: settingsQuery.data.streetName || '',
        district: settingsQuery.data.district || '',
        city: settingsQuery.data.city || '',
        postalCode: settingsQuery.data.postalCode || '',
        additionalNumber: settingsQuery.data.additionalNumber || '',
        countryCode: settingsQuery.data.countryCode || 'SA',
        entityType: settingsQuery.data.entityType || 'LLC',
        businessCategory: settingsQuery.data.businessCategory || 'Information Technology',
        defaultBranchId: settingsQuery.data.defaultBranchId || '',
        currencyCode: settingsQuery.data.currencyCode || 'SAR',
        invoicingType: settingsQuery.data.invoicingType || 'BOTH',
        zatcaEffectiveDate: settingsQuery.data.zatcaEffectiveDate || '2026-01-01',
        contactEmail: settingsQuery.data.contactEmail || '',
        contactPhone: settingsQuery.data.contactPhone || '',
        autoSubmit: Boolean(settingsQuery.data.autoSubmit),
        sandboxBaseUrl: settingsQuery.data.sandboxBaseUrl || 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
        simulationBaseUrl: settingsQuery.data.simulationBaseUrl || 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
        productionBaseUrl: settingsQuery.data.productionBaseUrl || 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
        apiVersion: settingsQuery.data.apiVersion || 'V2',
        retryMaxAttempts: Number(settingsQuery.data.retryMaxAttempts || 5),
        retryBackoffSeconds: Number(settingsQuery.data.retryBackoffSeconds || 60),
      });
    }
  }, [settingsQuery.data]);

  const [newDev, setNewDev] = useState({
    deviceCode: '',
    deviceName: '',
    branchId: '',
    branchCode: 'MAIN',
    deviceType: 'ERP_CLOUD',
    environment: 'SANDBOX',
    vatNumber: '',
    crNumber: '',
    serialNumber: '',
    invoicingTypeCode: '1100',
  });

  const saveSettings = useMutation({
    mutationFn: () => {
      const payload = { ...form };
      if (!payload.defaultBranchId) payload.defaultBranchId = null;
      return api.put<any>('/zatca/settings', payload);
    },
    onSuccess: () => {
      toast.success('تم حفظ إعدادات المنشأة ومنظومة هيئة الزكاة بنجاح');
      qc.invalidateQueries({ queryKey: ['zatca-settings'] });
      qc.invalidateQueries({ queryKey: ['zatca-status'] });
    },
    onError: (e) => toast.error(e),
  });

  const createDevice = useMutation({
    mutationFn: () =>
      api.post<any>('/zatca/devices', {
        ...newDev,
        branchId: newDev.branchId || null,
        vatNumber: newDev.vatNumber || form.vatNumber,
        crNumber: newDev.crNumber || form.crNumber,
      }),
    onSuccess: () => {
      toast.success('تم تسجيل جهاز الفوترة الإلكترونية (EGS) بنجاح');
      setShowNewDevice(false);
      setNewDev({
        deviceCode: '',
        deviceName: '',
        branchId: '',
        branchCode: 'MAIN',
        deviceType: 'ERP_CLOUD',
        environment: form.environment || 'SANDBOX',
        vatNumber: form.vatNumber || '',
        crNumber: form.crNumber || '',
        serialNumber: '',
        invoicingTypeCode: '1100',
      });
      qc.invalidateQueries({ queryKey: ['zatca-devices'] });
      qc.invalidateQueries({ queryKey: ['zatca-status'] });
    },
    onError: (e) => toast.error(e),
  });

  const testConn = useMutation({
    mutationFn: (deviceId?: string) => api.post<any>('/zatca/test-connection', deviceId ? { deviceId } : {}),
    onSuccess: (res) => {
      if (res.reachable && res.authenticated) toast.success(res.messageAr || 'الاتصال بالهيئة صالح');
      else toast.error(res.messageAr || 'تحذير في المصادقة مع بوابة فاتورة');
      qc.invalidateQueries({ queryKey: ['zatca-devices'] });
      qc.invalidateQueries({ queryKey: ['zatca-settings'] });
      qc.invalidateQueries({ queryKey: ['zatca-status'] });
    },
    onError: (e) => toast.error(e),
  });

  if (settingsQuery.isLoading) return <Loading />;
  if (settingsQuery.error) return <ErrorState error={settingsQuery.error} />;

  const devices: any[] = Array.isArray(devicesQuery.data)
    ? devicesQuery.data
    : ((devicesQuery.data as any)?.data ?? []);
  const branches: any[] = Array.isArray(branchesQuery.data)
    ? branchesQuery.data
    : ((branchesQuery.data as any)?.data ?? []);

  return (
    <div className="space-y-6 animate-fade-in pb-14">
      <PageHeader
        title="إعدادات المنشأة والربط وأجهزة الفوترة (ZATCA Settings & EGS)"
        subtitle="تكوين العنوان الوطني السعودي المهيكل، إدارة الفروع وأجهزة الفوترة الإلكترونية (EGS)، الشهادات الرقمية، والفصل الكامل بين بيئات Sandbox و Simulation و Production."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/zatca/onboarding" className="btn-secondary text-sm">
              <KeyRound className="size-4 text-emerald-600" /> معالج الربط (7 خطوات)
            </Link>
            <button
              className="btn-primary text-sm"
              disabled={saveSettings.isPending}
              onClick={() => saveSettings.mutate()}
            >
              {saveSettings.isPending ? <Spinner /> : <Save className="size-4" />}
              حفظ كافة الإعدادات
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {[
          { id: 'ORG' as SettingsTab, label: 'بيانات المنشأة والعنوان الوطني (19 حقلاً)', icon: Building2 },
          { id: 'DEVICES' as SettingsTab, label: `أجهزة الفوترة EGS والشهادات (${devices.length})`, icon: Cpu },
          { id: 'GATEWAY' as SettingsTab, label: 'بيئات الربط (Sandbox / Production) وإعادة المحاولة', icon: Server },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition-all ${
                active
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700'
              }`}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: Organization & Saudi National Address (19 Mandatory Fields) */}
      {tab === 'ORG' && (
        <div className="space-y-5">
          <div className="card p-5 sm:p-6 space-y-5">
            <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                الهوية القانونية والضريبية للمنشأة
              </h3>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                تُدرج هذه الحقول مباشرة داخل وسم AccountingSupplierParty في ملف UBL 2.1 XML وفي شهادة CSR
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="اسم المنشأة (عربي)" required>
                <input
                  className="input"
                  value={form.organizationNameAr || ''}
                  onChange={(e) => setForm({ ...form, organizationNameAr: e.target.value })}
                />
              </Field>
              <Field label="اسم المنشأة (إنجليزي)" required>
                <input
                  className="input"
                  dir="ltr"
                  value={form.organizationNameEn || ''}
                  onChange={(e) => setForm({ ...form, organizationNameEn: e.target.value })}
                />
              </Field>
              <Field label="الرقم الضريبي (VAT Number — 15 رقماً)" required>
                <input
                  className="input font-mono"
                  dir="ltr"
                  maxLength={15}
                  placeholder="310123456700003"
                  value={form.vatNumber || ''}
                  onChange={(e) => setForm({ ...form, vatNumber: e.target.value })}
                />
              </Field>
              <Field label="رقم السجل التجاري (CRN)" required>
                <input
                  className="input font-mono"
                  dir="ltr"
                  value={form.crNumber || ''}
                  onChange={(e) => setForm({ ...form, crNumber: e.target.value })}
                />
              </Field>
              <Field label="نوع المنشأة (Entity Type)">
                <select
                  className="input"
                  value={form.entityType || 'LLC'}
                  onChange={(e) => setForm({ ...form, entityType: e.target.value })}
                >
                  <option value="LLC">شركة ذات مسؤولية محدودة (LLC)</option>
                  <option value="JSC">شركة مساهمة (JSC)</option>
                  <option value="SOLE">مؤسسة فردية</option>
                  <option value="BRANCH">فرع شركة أجنبية</option>
                  <option value="GOV">جهة حكومية / شبه حكومية</option>
                </select>
              </Field>
              <Field label="نوع النشاط التجاري (Business Category)">
                <input
                  className="input"
                  value={form.businessCategory || ''}
                  onChange={(e) => setForm({ ...form, businessCategory: e.target.value })}
                />
              </Field>
            </div>
          </div>

          <div className="card p-5 sm:p-6 space-y-5">
            <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                العنوان الوطني السعودي المهيكل (Mandatory National Address — BR-KSA-09)
              </h3>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                إلزامي لاجتياز قواعد التحقق BR-KSA-37 (رقم المبنى 4 أرقام) و BR-KSA-66 (الرمز البريدي 5 أرقام)
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="رقم المبنى (4 أرقام)" required>
                <input
                  className="input font-mono"
                  dir="ltr"
                  maxLength={4}
                  placeholder="4210"
                  value={form.buildingNumber || ''}
                  onChange={(e) => setForm({ ...form, buildingNumber: e.target.value })}
                />
              </Field>
              <Field label="اسم الشارع" required>
                <input
                  className="input"
                  value={form.streetName || ''}
                  onChange={(e) => setForm({ ...form, streetName: e.target.value })}
                />
              </Field>
              <Field label="الحي (District)" required>
                <input
                  className="input"
                  value={form.district || ''}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                />
              </Field>
              <Field label="المدينة (City)" required>
                <input
                  className="input"
                  value={form.city || ''}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </Field>
              <Field label="الرمز البريدي (5 أرقام)" required>
                <input
                  className="input font-mono"
                  dir="ltr"
                  maxLength={5}
                  placeholder="12211"
                  value={form.postalCode || ''}
                  onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                />
              </Field>
              <Field label="الرقم الإضافي (4 أرقام)">
                <input
                  className="input font-mono"
                  dir="ltr"
                  maxLength={4}
                  placeholder="7412"
                  value={form.additionalNumber || ''}
                  onChange={(e) => setForm({ ...form, additionalNumber: e.target.value })}
                />
              </Field>
              <Field label="رمز الدولة (ISO)">
                <input
                  className="input font-mono uppercase"
                  dir="ltr"
                  maxLength={2}
                  value={form.countryCode || 'SA'}
                  onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field label="الفرع الافتراضي">
                <select
                  className="input"
                  value={form.defaultBranchId || ''}
                  onChange={(e) => setForm({ ...form, defaultBranchId: e.target.value })}
                >
                  <option value="">الفرع الرئيسي (افتراضي)</option>
                  {branches.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.code} — {b.nameAr}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="card p-5 sm:p-6 space-y-5">
            <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                نطاق الفوترة، تاريخ التطبيق، وبيانات التواصل
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="العملة الافتراضية">
                <input
                  className="input font-mono"
                  dir="ltr"
                  value={form.currencyCode || 'SAR'}
                  onChange={(e) => setForm({ ...form, currencyCode: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field label="نوع الفوترة المعتمدة">
                <select
                  className="input"
                  value={form.invoicingType || 'BOTH'}
                  onChange={(e) => setForm({ ...form, invoicingType: e.target.value })}
                >
                  <option value="BOTH">قياسية (B2B) + مبسطة (B2C)</option>
                  <option value="STANDARD">قياسية فقط (B2B — Clearance)</option>
                  <option value="SIMPLIFIED">مبسطة فقط (B2C — Reporting)</option>
                </select>
              </Field>
              <Field label="تاريخ بدء تطبيق المرحلة الثانية">
                <input
                  type="date"
                  className="input"
                  value={form.zatcaEffectiveDate || ''}
                  onChange={(e) => setForm({ ...form, zatcaEffectiveDate: e.target.value })}
                />
              </Field>
              <Field label="الإرسال التلقائي بعد ترحيل الفاتورة">
                <label className="flex items-center gap-2.5 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="size-4 rounded accent-indigo-600"
                    checked={Boolean(form.autoSubmit)}
                    onChange={(e) => setForm({ ...form, autoSubmit: e.target.checked })}
                  />
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    إرسال فوري تلقائي بعد الترحيل
                  </span>
                </label>
              </Field>
              <Field label="البريد الإلكتروني لمسؤول الضرائب">
                <input
                  className="input"
                  dir="ltr"
                  value={form.contactEmail || ''}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                />
              </Field>
              <Field label="رقم التواصل">
                <input
                  className="input font-mono"
                  dir="ltr"
                  value={form.contactPhone || ''}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                />
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Multi-Branch EGS Devices & Digital Certificates */}
      {tab === 'DEVICES' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {['ALL', 'SANDBOX', 'SIMULATION', 'PRODUCTION'].map((env) => (
                <button
                  key={env}
                  onClick={() => setEnvFilter(env)}
                  className={`rounded-xl px-3.5 py-2 text-xs font-extrabold border transition-all ${
                    envFilter === env
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700'
                  }`}
                >
                  {env === 'ALL' ? 'جميع البيئات' : env}
                </button>
              ))}
            </div>
            <button
              className="btn-primary text-sm"
              onClick={() => {
                setNewDev((prev) => ({
                  ...prev,
                  environment: form.environment || 'SANDBOX',
                  vatNumber: form.vatNumber || '',
                  crNumber: form.crNumber || '',
                }));
                setShowNewDevice(true);
              }}
            >
              <Plus className="size-4" /> تسجيل جهاز فوترة جديد (EGS)
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {devices.length === 0 ? (
              <div className="lg:col-span-2 card p-10 text-center space-y-3">
                <Cpu className="size-10 mx-auto text-slate-400" />
                <div className="text-base font-bold text-slate-800 dark:text-white">
                  لا توجد أجهزة فوترة إلكترونية (EGS) مسجلة في هذه البيئة
                </div>
                <p className="text-xs text-slate-500">سجّل جهاز EGS جديداً أو افتح معالج الربط المكوّن من 7 خطوات.</p>
              </div>
            ) : (
              devices.map((d: any) => (
                <div key={d.id} className="card p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-extrabold text-slate-900 dark:text-white">{d.deviceName}</h4>
                        <Badge color={d.environment === 'PRODUCTION' ? 'green' : d.environment === 'SIMULATION' ? 'blue' : 'amber'}>
                          {d.environment}
                        </Badge>
                        <Badge color={CERT_COLOR[d.certificateStatus] || 'slate'}>{d.certificateStatus}</Badge>
                      </div>
                      <div className="text-xs font-mono text-slate-600 dark:text-slate-300 mt-1">
                        {d.deviceCode} • {d.serialNumber}
                      </div>
                    </div>
                    <Badge color={d.connectionStatus === 'CONNECTED' ? 'green' : 'amber'}>
                      {d.connectionStatus === 'CONNECTED' ? 'متصل' : 'غير مختبر'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3 text-xs">
                    <div>
                      <div className="text-slate-500">الفرع</div>
                      <div className="font-bold text-slate-900 dark:text-white mt-0.5">{d.branchName || 'الفرع الرئيسي'}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">الرقم الضريبي</div>
                      <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">{d.vatNumber}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">عداد الفواتير (ICV)</div>
                      <div className="font-mono font-bold text-indigo-600 mt-0.5">#{d.icvCounter ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">CSR & المفتاح الخاص</div>
                      <div className="font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                        {d.hasCsr && d.hasPrivateKey ? 'مشفّر AES-256-GCM ✓' : 'غير مولّد بعد'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">انتهاء الشهادة</div>
                      <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                        {d.csidExpiresAt ? String(d.csidExpiresAt).slice(0, 10) : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">آخر فحص اتصال</div>
                      <div className="font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                        {d.lastTestedAt ? dateTime(d.lastTestedAt) : 'لم يُفحص'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      className="btn-secondary text-xs"
                      disabled={testConn.isPending}
                      onClick={() => testConn.mutate(d.id)}
                    >
                      <Wifi className="size-3.5 text-sky-600" /> اختبار اتصال الجهاز
                    </button>
                    <Link to={`/zatca/onboarding?deviceId=${d.id}`} className="btn-primary text-xs">
                      <KeyRound className="size-3.5" /> استكمال الربط / تجديد الشهادة
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Sandbox / Simulation / Production Gateway Isolation & Retry Policy */}
      {tab === 'GATEWAY' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900 dark:bg-indigo-950/30 flex items-start gap-3">
            <ShieldCheck className="size-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-xs font-semibold text-indigo-950 dark:text-indigo-200 leading-relaxed">
              تُفصل بيانات الاختبار (Sandbox / Simulation) فصلاً تاماً عن بيئة الإنتاج (Production) على مستوى أجهزة EGS والشهادات وسجل الإرسال.
              تُحفظ جميع المفاتيح الخاصة وأسرار CSID مشفرة بالكامل على الخادم (AES-256-GCM) ولا تُكشف أبداً في الواجهة الأمامية.
            </div>
          </div>

          <div className="card p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  البيئة النشطة وعناوين بوابة فاتورة (Fatoora API V2)
                </h3>
              </div>
              <button className="btn-secondary text-xs" disabled={testConn.isPending} onClick={() => testConn.mutate(undefined)}>
                {testConn.isPending ? <Spinner /> : <RefreshCw className="size-3.5" />}
                اختبار الاتصال بالبيئة النشطة
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { id: 'SANDBOX', title: 'بيئة التجربة (Sandbox)', desc: 'لاختبارات التطوير الأولية عبر Developer Portal' },
                { id: 'SIMULATION', title: 'بيئة المحاكاة (Simulation)', desc: 'لمحاكاة الإنتاج قبل الاعتماد النهائي' },
                { id: 'PRODUCTION', title: 'بيئة الإنتاج الحية (Production)', desc: 'للإرسال الضريبي الرسمي الفعلي إلى هيئة الزكاة' },
              ].map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setForm({ ...form, environment: e.id })}
                  className={`rounded-2xl border p-4 text-right transition-all ${
                    form.environment === e.id
                      ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-200 dark:bg-indigo-950/40 dark:ring-indigo-900'
                      : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white">{e.title}</span>
                    {form.environment === e.id && <CheckCircle2 className="size-4 text-indigo-600" />}
                  </div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-1">{e.desc}</p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="رابط Developer Portal / Sandbox API">
                <input
                  className="input font-mono text-xs"
                  dir="ltr"
                  value={form.sandboxBaseUrl || ''}
                  onChange={(e) => setForm({ ...form, sandboxBaseUrl: e.target.value })}
                />
              </Field>
              <Field label="رابط Simulation API">
                <input
                  className="input font-mono text-xs"
                  dir="ltr"
                  value={form.simulationBaseUrl || ''}
                  onChange={(e) => setForm({ ...form, simulationBaseUrl: e.target.value })}
                />
              </Field>
              <Field label="رابط Production Core API">
                <input
                  className="input font-mono text-xs"
                  dir="ltr"
                  value={form.productionBaseUrl || ''}
                  onChange={(e) => setForm({ ...form, productionBaseUrl: e.target.value })}
                />
              </Field>
              <Field label="إصدار بروتوكول الهيئة (Accept-Version)">
                <input
                  className="input font-mono"
                  dir="ltr"
                  value={form.apiVersion || 'V2'}
                  onChange={(e) => setForm({ ...form, apiVersion: e.target.value })}
                />
              </Field>
              <Field label="الحد الأقصى لمحاولات إعادة الإرسال (Retry Queue)">
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="input font-mono"
                  value={form.retryMaxAttempts ?? 5}
                  onChange={(e) => setForm({ ...form, retryMaxAttempts: Number(e.target.value) })}
                />
              </Field>
              <Field label="فترة الانتظار الأولية لإعادة المحاولة (ثانية)">
                <input
                  type="number"
                  min={10}
                  max={3600}
                  className="input font-mono"
                  value={form.retryBackoffSeconds ?? 60}
                  onChange={(e) => setForm({ ...form, retryBackoffSeconds: Number(e.target.value) })}
                />
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* Register New EGS Device Modal */}
      <Modal open={showNewDevice} onClose={() => setShowNewDevice(false)} title="تسجيل وحدة فوترة إلكترونية جديدة (EGS Device)">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="اسم الجهاز / الوحدة" required>
              <input
                className="input"
                placeholder="جهاز المبيعات - فرع جدة"
                value={newDev.deviceName}
                onChange={(e) => setNewDev({ ...newDev, deviceName: e.target.value })}
              />
            </Field>
            <Field label="رمز الجهاز (Device Code)" required>
              <input
                className="input font-mono"
                dir="ltr"
                placeholder="EGS-JED-01"
                value={newDev.deviceCode}
                onChange={(e) => setNewDev({ ...newDev, deviceCode: e.target.value })}
              />
            </Field>
            <Field label="البيئة" required>
              <select
                className="input"
                value={newDev.environment}
                onChange={(e) => setNewDev({ ...newDev, environment: e.target.value })}
              >
                <option value="SANDBOX">SANDBOX (تجربة)</option>
                <option value="SIMULATION">SIMULATION (محاكاة)</option>
                <option value="PRODUCTION">PRODUCTION (إنتاج رسمي)</option>
              </select>
            </Field>
            <Field label="نوع الجهاز">
              <select
                className="input"
                value={newDev.deviceType}
                onChange={(e) => setNewDev({ ...newDev, deviceType: e.target.value })}
              >
                <option value="ERP_CLOUD">نظام محاسبي سحابي (ERP)</option>
                <option value="POS">نقطة بيع (POS)</option>
                <option value="BRANCH_TERMINAL">جهاز فرع</option>
                <option value="API_GATEWAY">بوابة تكامل API</option>
              </select>
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
            <Field label="الرقم التسلسلي للجهاز" required>
              <input
                className="input font-mono"
                dir="ltr"
                placeholder="JED-2026-001"
                value={newDev.serialNumber}
                onChange={(e) => setNewDev({ ...newDev, serialNumber: e.target.value })}
              />
            </Field>
            <Field label="الفرع المرتبط">
              <select
                className="input"
                value={newDev.branchId}
                onChange={(e) => setNewDev({ ...newDev, branchId: e.target.value })}
              >
                <option value="">الفرع الرئيسي</option>
                {branches.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.nameAr}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="نطاق فواتير الجهاز (Title Code)">
              <select
                className="input"
                value={newDev.invoicingTypeCode}
                onChange={(e) => setNewDev({ ...newDev, invoicingTypeCode: e.target.value })}
              >
                <option value="1100">1100 — قياسية ومبسطة معاً</option>
                <option value="1000">1000 — قياسية فقط (B2B)</option>
                <option value="0100">0100 — مبسطة فقط (B2C)</option>
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button className="btn-secondary" onClick={() => setShowNewDevice(false)}>إلغاء</button>
            <button
              className="btn-primary"
              disabled={createDevice.isPending || !newDev.deviceCode || !newDev.deviceName || !newDev.serialNumber}
              onClick={() => createDevice.mutate()}
            >
              {createDevice.isPending ? <Spinner /> : <Globe className="size-4" />}
              تسجيل الجهاز
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
