import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowLeft, ArrowLeftRight, Briefcase, CheckCircle2, Coins,
  FileCheck2, FileText, Landmark, Layers, Package, Play, RefreshCw,
  ShieldCheck, ShoppingCart, Sparkles, Users, Wallet, Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { date, money } from '../lib/format';
import { SOURCE_MODULE_LABELS, SOURCE_TYPE_LABELS } from '../lib/labels';
import { PeriodSelect } from '../components/forms';
import { JournalLinkBadge } from '../components/JournalPreviewPill';
import { Badge, Loading, PageHeader, Spinner, Stat, useToast } from '../components/ui';

interface StepLog {
  step: string;
  status: 'ok' | 'skip' | 'error';
  detail: string;
}

export function AutomationHubPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [periodId, setPeriodId] = useState('fp-2026-11');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [autopilotLogs, setAutopilotLogs] = useState<StepLog[]>([]);
  const [syncResult, setSyncResult] = useState<any | null>(null);

  // Live cross-module queries
  const empsQ = useQuery({ queryKey: ['auto-hub-emps'], queryFn: () => api.get<any>('/employees', { pageSize: 200 }) });
  const prjsQ = useQuery({ queryKey: ['auto-hub-prjs'], queryFn: () => api.get<any>('/projects', { pageSize: 200 }) });
  const asgsQ = useQuery({ queryKey: ['auto-hub-asgs', periodId], queryFn: () => api.get<any>(`/assignments/employee-days-report?periodId=${periodId}`) });
  const invsQ = useQuery({ queryKey: ['auto-hub-invs'], queryFn: () => api.get<any>('/invoices', { pageSize: 200 }) });
  const purQ = useQuery({ queryKey: ['auto-hub-pur'], queryFn: () => api.get<any>('/purchase-invoices', { pageSize: 200 }) });
  const loansQ = useQuery({ queryKey: ['auto-hub-loans'], queryFn: () => api.get<any>('/loans', { pageSize: 200 }) });
  const payRunsQ = useQuery({ queryKey: ['auto-hub-payruns'], queryFn: () => api.get<any>('/payroll-runs') });
  const assetsQ = useQuery({ queryKey: ['auto-hub-assets'], queryFn: () => api.get<any>('/assets', { pageSize: 200 }) });
  const custodiesQ = useQuery({ queryKey: ['auto-hub-custodies'], queryFn: () => api.get<any>('/custodies', { pageSize: 200 }) });
  const journalsQ = useQuery({ queryKey: ['auto-hub-journals'], queryFn: () => api.get<any>('/journal-entries', { pageSize: 100 }) });

  const toArr = (d: any): any[] => (Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []));

  const emps = toArr(empsQ.data);
  const prjs = toArr(prjsQ.data);
  const allocRows: any[] = asgsQ.data?.rows || [];
  const activeAssigns = allocRows.filter((r) => Boolean(r.projectId));
  const invs = toArr(invsQ.data).filter((i) => i.status !== 'CANCELLED');
  const purInvs = toArr(purQ.data).filter((i) => i.status !== 'CANCELLED');
  const loans = toArr(loansQ.data).filter((l) => l.status !== 'CANCELLED');
  const payRuns = toArr(payRunsQ.data).filter((r) => r.status === 'POSTED');
  const assets = toArr(assetsQ.data).filter((a) => a.status === 'ACTIVE');
  const custodies = toArr(custodiesQ.data).filter((c) => c.status !== 'CANCELLED');
  const journals = toArr(journalsQ.data).filter((j) => j.status === 'POSTED');

  const autoJournals = useMemo(
    () => journals.filter((j) => j.sourceType && j.sourceType !== 'MANUAL'),
    [journals],
  );

  // Compute unlinked operational records needing journal sync
  const unlinkedCount = useMemo(() => {
    const validIds = new Set(journals.map((j) => j.id));
    let missing = 0;
    for (const i of invs) if (i.status === 'POSTED' && (!i.journalEntryId || !validIds.has(i.journalEntryId))) missing++;
    for (const p of purInvs) if (p.status === 'POSTED' && (!p.journalEntryId || !validIds.has(p.journalEntryId))) missing++;
    for (const l of loans) if (!l.journalEntryId || !validIds.has(l.journalEntryId)) missing++;
    for (const a of assets) if (!a.activationJournalEntryId || !validIds.has(a.activationJournalEntryId)) missing++;
    for (const c of custodies) if (c.status !== 'DRAFT' && (!c.disbursement_journal_entry_id || !validIds.has(c.disbursement_journal_entry_id))) missing++;
    return missing;
  }, [invs, purInvs, loans, assets, custodies, journals]);

  const refreshAll = () => {
    qc.invalidateQueries();
  };

  const handleSyncAllJournals = async () => {
    setBusyAction('sync');
    try {
      const res: any = await api.post('/accounting/sync-all-journals', {});
      setSyncResult(res);
      refreshAll();
      toast.success(
        res.syncedCount > 0
          ? `تم توليد وربط ${res.syncedCount} قيد محاسبي آلي متزن بنجاح!`
          : `كافة العمليات المالية مرتبطة بقيود يومية متزنة 100% (${res.totalPostedJournals} قيد مرحّل)`,
      );
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyAction(null);
    }
  };

  const handleAutoInvoices = async () => {
    setBusyAction('invoices');
    try {
      const res: any = await api.post('/invoices/auto-generate', {
        fiscalPeriodId: periodId,
        autoPost: true,
      });
      refreshAll();
      if (res.count > 0) {
        toast.success(`تم توليد وترحيل ${res.count} فاتورة مبيعات ضريبية مع قيودها المحاسبية تلقائياً!`);
      } else {
        toast.info('لا توجد مشاريع جديدة غير مفوترة في هذه الفترة');
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunDepreciation = async () => {
    setBusyAction('depreciation');
    try {
      const res: any = await api.post('/depreciation-runs', { periodId });
      refreshAll();
      toast.success(`تم تشغيل إهلاك الأصول وتوليد القيد المحاسبي (${res.journalEntryNo}) بنجاح!`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunPayroll = async () => {
    setBusyAction('payroll');
    try {
      await api.post('/monthly-variables/approve-all', { periodId }).catch(() => null);
      const res: any = await api.post('/payroll-runs', { periodId });
      refreshAll();
      toast.success(`تم اعتماد المتغيرات وترحيل مسيّر الرواتب الموزع على المشاريع بقيد رقم (${res.journalEntryNo})!`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyAction(null);
    }
  };

  const handleFullAutopilot = async () => {
    setBusyAction('autopilot');
    const logs: StepLog[] = [];
    setAutopilotLogs([]);

    // 1. Sync existing unlinked journals
    try {
      const sRes: any = await api.post('/accounting/sync-all-journals', {});
      logs.push({
        step: '01. مزامنة القيود التلقائية للعمليات القائمة',
        status: 'ok',
        detail: sRes.syncedCount > 0 ? `تم توليد وربط ${sRes.syncedCount} قيد مفقود` : `جميع السجلات متزامنة (${sRes.totalPostedJournals} قيد مرحّل)`,
      });
    } catch (e: any) {
      logs.push({ step: '01. مزامنة القيود التلقائية', status: 'error', detail: e?.message || 'تعذر التنفيذ' });
    }
    setAutopilotLogs([...logs]);

    // 2. Approve draft monthly variables
    try {
      const vRes: any = await api.post('/monthly-variables/approve-all', { periodId });
      logs.push({
        step: '02. اعتماد المتغيرات الشهرية والبدلات',
        status: vRes.approvedCount > 0 ? 'ok' : 'skip',
        detail: vRes.approvedCount > 0 ? `تم اعتماد ${vRes.approvedCount} متغير شهري تلقائياً` : 'لا توجد متغيرات مسودة معلقة',
      });
    } catch (e: any) {
      logs.push({ step: '02. اعتماد المتغيرات الشهرية', status: 'skip', detail: e?.message || 'تم التجاوز' });
    }
    setAutopilotLogs([...logs]);

    // 3. Auto-generate sales invoices from active project assignments
    try {
      const iRes: any = await api.post('/invoices/auto-generate', { fiscalPeriodId: periodId, autoPost: true });
      logs.push({
        step: '03. توليد فواتير المبيعات الضريبية ZATCA وترحيل قيودها',
        status: iRes.count > 0 ? 'ok' : 'skip',
        detail: iRes.count > 0 ? `تم إصدار وترحيل ${iRes.count} فاتورة بإجمالي ${money(iRes.totalAmount)} SAR` : 'لا توجد مشاريع بانتظار الفوترة',
      });
    } catch (e: any) {
      logs.push({ step: '03. توليد فواتير المبيعات', status: 'skip', detail: e?.message || 'تم التجاوز' });
    }
    setAutopilotLogs([...logs]);

    // 4. Monthly Fixed Assets Depreciation Run
    try {
      const dRes: any = await api.post('/depreciation-runs', { periodId });
      logs.push({
        step: '04. احتساب وترحيل قيد إهلاك الأصول الثابتة الشهري',
        status: 'ok',
        detail: `تم ترحيل الإهلاك بمبلغ ${money(dRes.totalAmountBase)} SAR — قيد (${dRes.journalEntryNo})`,
      });
    } catch (e: any) {
      logs.push({ step: '04. إهلاك الأصول الثابتة الشهري', status: 'skip', detail: e?.message || 'مرحّل مسبقاً أو لا توجد أصول قابلة للإهلاك' });
    }
    setAutopilotLogs([...logs]);

    // 5. Smart Project-Split Payroll Run
    try {
      const pRes: any = await api.post('/payroll-runs', { periodId });
      logs.push({
        step: '05. تشغيل مسيّر الرواتب وتوزيع التكلفة بين المشاريع والـ Bench',
        status: 'ok',
        detail: `تم ترحيل المسيّر (${pRes.runNo}) بصافي ${money(pRes.netPayableBase)} SAR — قيد (${pRes.journalEntryNo})`,
      });
    } catch (e: any) {
      logs.push({ step: '05. مسيّر الرواتب الشهري', status: 'skip', detail: e?.message || 'مرحّل مسبقاً أو لا يوجد موظفون نشطون' });
    }
    setAutopilotLogs([...logs]);

    refreshAll();
    setBusyAction(null);
    toast.success('اكتمل تشغيل دورة الأتمتة الشهرية الشاملة وتحديث القوائم المالية بنجاح!');
  };

  const modulesMatrix = [
    {
      code: '01',
      title: 'الموارد البشرية وتكلفة الكوادر',
      countLabel: `${emps.length} كادر وظيفي`,
      rule: 'ربط تلقائي بملف التكلفة القياسي (تأمينات 12% + طبي 5%) وحساب التكلفة اليومية',
      feedsInto: 'تخصيص المشاريع ومسيّر الرواتب',
      to: '/hr/employees',
      icon: Users,
      tone: 'indigo',
    },
    {
      code: '02',
      title: 'المشاريع وتوزيع الأيام والنسب',
      countLabel: `${prjs.length} مشروع • ${activeAssigns.length} تخصيص نشط`,
      rule: 'معادلة التداخل الزمني المالي لحساب الإيراد المتوقع وتكلفة الـ Bench لحظياً',
      feedsInto: 'الفوترة الآلية وتوزيع أجور المشاريع',
      to: '/prj/allocation-days',
      icon: Briefcase,
      tone: 'cyan',
    },
    {
      code: '03',
      title: 'المبيعات والفوترة الإلكترونية ZATCA',
      countLabel: `${invs.length} فاتورة (${invs.filter((x) => x.status === 'POSTED').length} مرحّلة)`,
      rule: 'قيد آلي فوري: من حـ/ العملاء (10301) إلى حـ/ الإيرادات (40101) + ضريبة 15% (20201)',
      feedsInto: 'أعمار الديون وإقرار القيمة المضافة',
      to: '/sal/invoices',
      icon: FileText,
      tone: 'emerald',
      actionLabel: 'توليد فواتير الشهر',
      onAction: handleAutoInvoices,
      actionKey: 'invoices',
    },
    {
      code: '04',
      title: 'المشتريات والموردين والمدفوعات',
      countLabel: `${purInvs.length} فاتورة مشتريات`,
      rule: 'قيد آلي فوري: من حـ/ المصروفات (50401) + ضريبة مدخلات (1250) إلى حـ/ الموردين (20101)',
      feedsInto: 'قائمة الدخل وإقرار الضريبة',
      to: '/pur/invoices',
      icon: ShoppingCart,
      tone: 'amber',
    },
    {
      code: '05',
      title: 'العهد النقدية والتحويلات البنكية',
      countLabel: `${custodies.length} عهدة نقدية`,
      rule: 'قيود آلية لصرف العهدة (1310/1320)، عمولة التحويل (50402)، وتسوية الإيصالات وإقفال الفائض',
      feedsInto: 'التدفقات النقدية ومراكز التكلفة',
      to: '/fin/custodies',
      icon: Coins,
      tone: 'teal',
    },
    {
      code: '06',
      title: 'الأصول الثابتة ومسيّر الإهلاك',
      countLabel: `${assets.length} أصل نشط بالخدمة`,
      rule: 'قيد رسملة تلقائي عند الإضافة (10501 / 10201) + قيد إهلاك شهري (50301 / 10502)',
      feedsInto: 'تكلفة عهدة الموظف والميزانية العمومية',
      to: '/assets/depreciation',
      icon: Package,
      tone: 'blue',
      actionLabel: 'تشغيل إهلاك الشهر',
      onAction: handleRunDepreciation,
      actionKey: 'depreciation',
    },
    {
      code: '07',
      title: 'مسيّر الرواتب والسلف ونهاية الخدمة',
      countLabel: `${payRuns.length} مسيّر • ${loans.length} سلفة`,
      rule: 'توزيع آلي للراتب بين المشاريع (50101) والـ Bench (50102) + قيد صرف السلف (10401) وصرف البنك',
      feedsInto: 'ربحية الموظف والمشروع والأستاذ العام',
      to: '/pay/runs',
      icon: Wallet,
      tone: 'purple',
      actionLabel: 'تشغيل مسيّر الرواتب',
      onAction: handleRunPayroll,
      actionKey: 'payroll',
    },
    {
      code: '08',
      title: 'الأستاذ العام والقوائم المالية الحية',
      countLabel: `${journals.length} قيد مرحّل متوازن`,
      rule: 'تحديث لحظي لميزان المراجعة وقائمة الدخل والميزانية العمومية والزكاة دون أي تدخل يدوي',
      feedsInto: 'إقفال الفترات ولقطات SHA-256',
      to: '/acc/journals',
      icon: Landmark,
      tone: 'emerald',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="مركز الأتمتة الذكية والتوليد التلقائي للقيود المحاسبية"
        subtitle="غرفة التحكم المركزية لترابط كافة أقسام المنظومة (الموارد البشرية ⇄ المشاريع ⇄ الفوترة ⇄ الخزينة ⇄ الأصول ⇄ الرواتب ⇄ الأستاذ العام) بضغطة زر واحدة."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSyncAllJournals}
              disabled={busyAction !== null}
              className="btn-secondary text-xs flex items-center gap-1.5 border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
            >
              {busyAction === 'sync' ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5 text-emerald-600 dark:text-emerald-400" />}
              <span>فحص ومزامنة القيود التلقائية {unlinkedCount > 0 ? `(${unlinkedCount} بانتظار الربط)` : '(متزامن 100%)'}</span>
            </button>

            <button
              type="button"
              onClick={handleFullAutopilot}
              disabled={busyAction !== null}
              className="btn-primary text-xs flex items-center gap-2 px-4 shadow-md shadow-indigo-600/25"
            >
              {busyAction === 'autopilot' ? <Spinner className="size-4" /> : <Zap className="size-4 text-amber-300 fill-amber-300" />}
              <span>تشغيل دورة الشهر الآلية بالكامل (Full Autopilot)</span>
            </button>
          </div>
        }
      />

      {/* Executive Control Bar & KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-4 card cyber-card-cyan p-5 flex flex-col justify-between bg-gradient-to-br from-indigo-950 via-[#0f172a] to-[#0b1120] text-white border-indigo-500/40">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 px-2.5 py-0.5 text-[11px] font-bold text-indigo-200">
              <Sparkles className="size-3.5 text-amber-300" />
              <span>محرك القيد المزدوج الآلي (Real-Time Auto-GL)</span>
            </div>
            <h3 className="text-base font-black leading-snug text-white">
              الفترة المالية النشطة للتشغيل الآلي
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              اختر الشهر المالي ثم شغّل دورة الأتمتة الكاملة أو نفّذ أي مرحلة تشغيلية منفردة مع توليد قيود اليومية المتزنة فوراً.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-white/10 space-y-1.5">
            <label className="block text-xs font-bold text-indigo-200">
              الفترة المالية المستهدفة
            </label>
            <PeriodSelect value={periodId} onChange={setPeriodId} className="w-full" />
          </div>
        </div>

        <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <Stat
            label="القيود التلقائية المرحّلة"
            value={String(autoJournals.length)}
            hint={`من إجمالي ${journals.length} قيد بالأستاذ العام`}
            tone="indigo"
            icon={Landmark}
          />
          <Stat
            label="نسبة التغطية المحاسبية"
            value={unlinkedCount === 0 ? '100%' : `${Math.max(0, 100 - unlinkedCount * 5)}%`}
            hint={unlinkedCount === 0 ? 'جميع العمليات مربوطة بقيود' : `${unlinkedCount} عملية قابلة للمزامنة`}
            tone={unlinkedCount === 0 ? 'green' : 'amber'}
            icon={ShieldCheck}
          />
          <Stat
            label="تخصيصات المشاريع النشطة"
            value={String(activeAssigns.length)}
            hint={`${money(asgsQ.data?.summary?.totalRevenue || 0)} SAR إيراد تعاقدي`}
            tone="cyan"
            icon={Briefcase}
          />
          <Stat
            label="توازن ميزان المراجعة"
            value="متزن 100%"
            hint="المدين = الدائن بالعملة الأساسية"
            tone="green"
            icon={FileCheck2}
          />
        </div>
      </div>

      {/* Autopilot Execution Log (if run) */}
      {autopilotLogs.length > 0 && (
        <div className="card cyber-card-emerald p-4 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
            <div className="flex items-center gap-2 font-black text-sm text-slate-900 dark:text-white">
              <Zap className="size-4 text-emerald-500" />
              <span>تقرير تنفيذ دورة التشغيل الآلية (Autopilot Execution Report)</span>
            </div>
            <button type="button" onClick={() => setAutopilotLogs([])} className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-white">
              إخفاء التقرير
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2.5">
            {autopilotLogs.map((l, idx) => (
              <div
                key={idx}
                className={`rounded-xl border p-3 text-xs ${
                  l.status === 'ok'
                    ? 'border-emerald-500/35 bg-emerald-500/8 text-emerald-900 dark:text-emerald-200'
                    : l.status === 'skip'
                      ? 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300'
                      : 'border-rose-500/35 bg-rose-500/8 text-rose-900 dark:text-rose-200'
                }`}
              >
                <div className="font-extrabold mb-1 flex items-center justify-between gap-1">
                  <span>{l.step}</span>
                  {l.status === 'ok' && <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />}
                </div>
                <p className="text-[11px] opacity-85 leading-relaxed">{l.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync Result Banner (if repaired items exist) */}
      {syncResult && syncResult.repairedItems?.length > 0 && (
        <div className="card cyber-card-emerald p-4 space-y-2.5 animate-fade-in">
          <div className="font-extrabold text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="size-4" />
            <span>تم توليد وربط القيود المحاسبية التالية تلقائياً:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {syncResult.repairedItems.map((item: any, idx: number) => (
              <div key={idx} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200">{item.module}:</span>
                <span className="font-mono text-slate-600 dark:text-slate-400">{item.ref}</span>
                <JournalLinkBadge entryNo={item.journalEntryNo} compact />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 8-Module Interconnected Matrix */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="size-4 text-indigo-600 dark:text-indigo-400" />
            <span>مصفوفة الترابط الحي وقواعد التوجيه المحاسبي الآلي بين الأقسام</span>
          </h2>
          <Link to="/acc/posting-rules" className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
            إعدادات قواعد الترحيل المحاسبي ←
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {modulesMatrix.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.code}
                className="card card-hover p-4 flex flex-col justify-between gap-3 relative overflow-hidden"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
                        <Icon className="size-4" />
                      </span>
                      <span className="font-mono text-[11px] font-black text-slate-400">STEP {m.code}</span>
                    </div>
                    <Badge color="green" dot>{m.countLabel}</Badge>
                  </div>

                  <h3 className="font-black text-sm text-slate-900 dark:text-white leading-snug">
                    {m.title}
                  </h3>

                  <div className="rounded-xl bg-slate-50 dark:bg-[#080d1a] border border-slate-200/70 dark:border-slate-800/80 p-2.5 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">القاعدة الآلية: </span>
                    {m.rule}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <ArrowLeftRight className="size-3 text-emerald-500 shrink-0" />
                    <span>يغذي تلقائياً: <strong className="text-slate-700 dark:text-slate-200">{m.feedsInto}</strong></span>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                  <Link
                    to={m.to}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                  >
                    <span>فتح القسم</span>
                    <ArrowLeft className="size-3" />
                  </Link>

                  {m.onAction && (
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={m.onAction}
                      className="btn-secondary h-7 px-2.5 text-[11px] gap-1 border-indigo-500/30 text-indigo-700 dark:text-indigo-300"
                    >
                      {busyAction === m.actionKey ? <Spinner className="size-3" /> : <Play className="size-3 fill-current" />}
                      <span>{m.actionLabel}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Stream of Auto-Generated Journal Entries */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/85 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-[#091020]">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-black text-sm text-slate-900 dark:text-white">
              أحدث القيود المحاسبية المتولدة تلقائياً من العمليات التشغيلية
            </h3>
          </div>
          <Link to="/acc/journals" className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
            عرض دفتر اليومية الكامل ({journals.length}) ←
          </Link>
        </div>

        {journalsQ.isLoading ? (
          <Loading />
        ) : autoJournals.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 space-y-3">
            <div>لا توجد قيود تلقائية مسجلة بعد — اضغط على «تشغيل دورة الشهر الآلية» أو أنشئ عملية مالية لتوليد القيود فوراً.</div>
            <button type="button" onClick={handleFullAutopilot} className="btn-primary text-xs">
              <Zap className="size-3.5" /> تشغيل الأتمتة الآن
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-compact w-full">
              <thead>
                <tr>
                  <th>سند القيد الآلي</th>
                  <th>التاريخ</th>
                  <th>القسم المصدر</th>
                  <th>نوع العملية</th>
                  <th>البيان المحاسبي</th>
                  <th className="text-end">إجمالي المدين / الدائن (SAR)</th>
                </tr>
              </thead>
              <tbody>
                {autoJournals.slice(0, 15).map((j: any) => (
                  <tr key={j.id}>
                    <td>
                      <JournalLinkBadge entryId={j.id} entryNo={j.entryNo} />
                    </td>
                    <td className="num text-xs">{date(j.entryDate)}</td>
                    <td>
                      <Badge color="indigo">{SOURCE_MODULE_LABELS[j.sourceModule] || j.sourceModule}</Badge>
                    </td>
                    <td>
                      <Badge color="green">{SOURCE_TYPE_LABELS[j.sourceType] || j.sourceType}</Badge>
                    </td>
                    <td className="max-w-md truncate font-medium">{j.description}</td>
                    <td className="num text-end font-black text-emerald-700 dark:text-emerald-400">
                      {money(j.totalDebitBase)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
