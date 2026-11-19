import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BarChart3, FileBarChart2, Search, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { date, money } from '../lib/format';
import { ExportMenu } from '../components/ExportMenu';
import { ExportColumnDef } from '../engine/export-engine';
import { ExecutiveBarChart, ExecutiveChartCard } from '../components/ExecutiveCharts';
import { Badge, ErrorState, Loading, PageHeader, Stat } from '../components/ui';

type ReportKey =
  | 'R01_SENT'
  | 'R02_ACCEPTED'
  | 'R03_REJECTED'
  | 'R04_PENDING'
  | 'R05_STANDARD'
  | 'R06_SIMPLIFIED'
  | 'R07_CREDIT_NOTES'
  | 'R08_DEBIT_NOTES'
  | 'R09_VAT_SUMMARY'
  | 'R10_BY_BRANCH'
  | 'R11_BY_DEVICE'
  | 'R12_BY_CLIENT'
  | 'R13_ERRORS_LOG'
  | 'R14_COMPLIANCE_CERTS';

const REPORTS: Array<{ id: ReportKey; num: string; title: string; group: string }> = [
  { id: 'R01_SENT', num: '01', title: 'الفواتير المرسلة', group: 'الحالات' },
  { id: 'R02_ACCEPTED', num: '02', title: 'الفواتير المقبولة (مُخلّصة ومُبلّغ عنها)', group: 'الحالات' },
  { id: 'R03_REJECTED', num: '03', title: 'الفواتير المرفوضة والفاشلة', group: 'الحالات' },
  { id: 'R04_PENDING', num: '04', title: 'الفواتير المعلقة وبانتظار الإرسال', group: 'الحالات' },
  { id: 'R05_STANDARD', num: '05', title: 'الفواتير الضريبية القياسية (B2B)', group: 'الأنواع' },
  { id: 'R06_SIMPLIFIED', num: '06', title: 'الفواتير الضريبية المبسطة (B2C)', group: 'الأنواع' },
  { id: 'R07_CREDIT_NOTES', num: '07', title: 'الإشعارات الدائنة (Credit Notes 381)', group: 'الأنواع' },
  { id: 'R08_DEBIT_NOTES', num: '08', title: 'الإشعارات المدينة (Debit Notes 383)', group: 'الأنواع' },
  { id: 'R09_VAT_SUMMARY', num: '09', title: 'ضريبة القيمة المضافة حسب النوع والحالة', group: 'تحليلية' },
  { id: 'R10_BY_BRANCH', num: '10', title: 'الفواتير حسب الفرع', group: 'تحليلية' },
  { id: 'R11_BY_DEVICE', num: '11', title: 'الفواتير حسب جهاز الفوترة (EGS)', group: 'تحليلية' },
  { id: 'R12_BY_CLIENT', num: '12', title: 'الفواتير حسب العميل', group: 'تحليلية' },
  { id: 'R13_ERRORS_LOG', num: '13', title: 'الأخطاء والرفض من هيئة الزكاة', group: 'تدقيقية' },
  { id: 'R14_COMPLIANCE_CERTS', num: '14', title: 'الامتثال وحالة الشهادات الرقمية', group: 'تدقيقية' },
];

export function ZatcaReportsPage() {
  const [report, setReport] = useState<ReportKey>('R01_SENT');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');

  const invQuery = useQuery({
    queryKey: ['zatca-reports-invoices'],
    queryFn: () => api.get<any[]>('/zatca/invoices'),
  });
  const subQuery = useQuery({
    queryKey: ['zatca-reports-submissions'],
    queryFn: () => api.get<any[]>('/zatca/submissions'),
  });
  const devQuery = useQuery({
    queryKey: ['zatca-reports-devices'],
    queryFn: () => api.get<any[]>('/zatca/devices'),
  });

  const allInvoices: any[] = useMemo(() => {
    const raw = Array.isArray(invQuery.data) ? invQuery.data : ((invQuery.data as any)?.data ?? []);
    return raw.filter((i: any) => {
      const dt = String(i.issueDate || '').slice(0, 10);
      if (fromDate && dt < fromDate) return false;
      if (toDate && dt > toDate) return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        return (
          String(i.invoiceNo || '').toLowerCase().includes(s) ||
          String(i.clientName || '').toLowerCase().includes(s) ||
          String(i.branchName || '').toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [invQuery.data, fromDate, toDate, search]);

  const allSubs: any[] = useMemo(() => {
    const raw = Array.isArray(subQuery.data) ? subQuery.data : ((subQuery.data as any)?.data ?? []);
    return raw.filter((s: any) => {
      const dt = String(s.createdAt || '').slice(0, 10);
      if (fromDate && dt < fromDate) return false;
      if (toDate && dt > toDate) return false;
      return true;
    });
  }, [subQuery.data, fromDate, toDate]);

  const devices: any[] = Array.isArray(devQuery.data) ? devQuery.data : ((devQuery.data as any)?.data ?? []);

  const { columns, rows, chartCats, chartVals, summary } = useMemo(() => {
    const invoiceCols: ExportColumnDef[] = [
      { key: 'invoiceNo', header: 'رقم الفاتورة', width: 18 },
      { key: 'invoiceType', header: 'النوع', width: 14 },
      { key: 'clientName', header: 'العميل', width: 24 },
      { key: 'issueDate', header: 'التاريخ', width: 14 },
      { key: 'subtotal', header: 'الصافي (SAR)', width: 16, type: 'currency', isTotal: true },
      { key: 'vatAmount', header: 'الضريبة (SAR)', width: 16, type: 'currency', isTotal: true },
      { key: 'totalAmount', header: 'الإجمالي (SAR)', width: 16, type: 'currency', isTotal: true },
      { key: 'zatcaStatus', header: 'حالة ZATCA', width: 16 },
    ];

    const groupBy = (items: any[], keyFn: (x: any) => string, labelHeader: string) => {
      const map = new Map<string, { group: string; count: number; subtotal: number; vat: number; total: number; accepted: number }>();
      for (const it of items) {
        const k = keyFn(it) || 'غير محدد';
        const cur = map.get(k) || { group: k, count: 0, subtotal: 0, vat: 0, total: 0, accepted: 0 };
        cur.count += 1;
        cur.subtotal += Number(it.subtotal || 0);
        cur.vat += Number(it.vatAmount || 0);
        cur.total += Number(it.totalAmount || 0);
        if (['CLEARED', 'REPORTED', 'ACCEPTED'].includes(it.zatcaStatus)) cur.accepted += 1;
        map.set(k, cur);
      }
      const list = Array.from(map.values()).map((r) => ({
        group: r.group,
        count: r.count,
        accepted: r.accepted,
        subtotal: r.subtotal.toFixed(2),
        vat: r.vat.toFixed(2),
        total: r.total.toFixed(2),
      }));
      return {
        columns: [
          { key: 'group', header: labelHeader, width: 26 },
          { key: 'count', header: 'عدد الفواتير', width: 14, isTotal: true },
          { key: 'accepted', header: 'المقبولة', width: 14, isTotal: true },
          { key: 'subtotal', header: 'الصافي (SAR)', width: 16, type: 'currency' as const, isTotal: true },
          { key: 'vat', header: 'ضريبة VAT (SAR)', width: 16, type: 'currency' as const, isTotal: true },
          { key: 'total', header: 'الإجمالي (SAR)', width: 16, type: 'currency' as const, isTotal: true },
        ],
        rows: list,
        chartCats: list.map((x) => x.group),
        chartVals: list.map((x) => Number(x.total)),
      };
    };

    const filterInv = (pred: (x: any) => boolean) => {
      const filtered = allInvoices.filter(pred);
      return {
        columns: invoiceCols,
        rows: filtered,
        chartCats: filtered.slice(0, 10).map((x) => x.invoiceNo),
        chartVals: filtered.slice(0, 10).map((x) => Number(x.totalAmount || 0)),
      };
    };

    let result: { columns: ExportColumnDef[]; rows: any[]; chartCats: string[]; chartVals: number[] };

    switch (report) {
      case 'R01_SENT':
        result = filterInv((i) => !['NOT_SUBMITTED', 'DRAFT', 'READY'].includes(i.zatcaStatus || 'NOT_SUBMITTED'));
        break;
      case 'R02_ACCEPTED':
        result = filterInv((i) => ['CLEARED', 'REPORTED', 'ACCEPTED', 'WARNING'].includes(i.zatcaStatus));
        break;
      case 'R03_REJECTED':
        result = filterInv((i) => ['REJECTED', 'FAILED', 'VALIDATION_FAILED'].includes(i.zatcaStatus));
        break;
      case 'R04_PENDING':
        result = filterInv((i) => ['NOT_SUBMITTED', 'READY', 'PENDING_SUBMISSION', 'RETRY_PENDING'].includes(i.zatcaStatus || 'NOT_SUBMITTED'));
        break;
      case 'R05_STANDARD':
        result = filterInv((i) => i.invoiceType === 'TAX_INVOICE');
        break;
      case 'R06_SIMPLIFIED':
        result = filterInv((i) => i.invoiceType === 'SIMPLIFIED');
        break;
      case 'R07_CREDIT_NOTES':
        result = filterInv((i) => i.invoiceType === 'CREDIT_NOTE');
        break;
      case 'R08_DEBIT_NOTES':
        result = filterInv((i) => i.invoiceType === 'DEBIT_NOTE');
        break;
      case 'R09_VAT_SUMMARY':
        result = groupBy(allInvoices, (i) => `${i.invoiceType || 'TAX_INVOICE'} — ${i.zatcaStatus || 'NOT_SUBMITTED'}`, 'النوع والحالة');
        break;
      case 'R10_BY_BRANCH':
        result = groupBy(allInvoices, (i) => i.branchName || 'الفرع الرئيسي', 'الفرع');
        break;
      case 'R11_BY_DEVICE':
        result = groupBy(allInvoices, (i) => i.deviceCode || 'EGS-MAIN-01', 'جهاز الفوترة (EGS)');
        break;
      case 'R12_BY_CLIENT':
        result = groupBy(allInvoices, (i) => i.clientName || 'غير محدد', 'العميل');
        break;
      case 'R13_ERRORS_LOG': {
        const errs = allSubs.filter((s) => ['REJECTED', 'FAILED', 'ERROR', 'RETRY_PENDING'].includes(s.status) || s.errorMessage);
        result = {
          columns: [
            { key: 'invoiceNo', header: 'رقم الفاتورة', width: 18 },
            { key: 'clientName', header: 'العميل', width: 22 },
            { key: 'environment', header: 'البيئة', width: 12 },
            { key: 'httpStatusCode', header: 'HTTP', width: 10 },
            { key: 'responseCode', header: 'كود الخطأ', width: 16 },
            { key: 'responseMessage', header: 'سبب الرفض / الخطأ', width: 38 },
          ],
          rows: errs,
          chartCats: errs.slice(0, 10).map((e) => e.invoiceNo),
          chartVals: errs.slice(0, 10).map((e) => Number(e.attemptNo || 1)),
        };
        break;
      }
      case 'R14_COMPLIANCE_CERTS': {
        const devRows = devices.map((d) => ({
          deviceName: d.deviceName,
          deviceCode: d.deviceCode,
          branchName: d.branchName || 'الفرع الرئيسي',
          environment: d.environment,
          certificateStatus: d.certificateStatus,
          connectionStatus: d.connectionStatus,
          icvCounter: d.icvCounter ?? 0,
          csidExpiresAt: d.csidExpiresAt ? String(d.csidExpiresAt).slice(0, 10) : '—',
        }));
        result = {
          columns: [
            { key: 'deviceName', header: 'اسم الجهاز (EGS)', width: 24 },
            { key: 'deviceCode', header: 'الرمز', width: 14 },
            { key: 'branchName', header: 'الفرع', width: 18 },
            { key: 'environment', header: 'البيئة', width: 12 },
            { key: 'certificateStatus', header: 'حالة الشهادة', width: 16 },
            { key: 'connectionStatus', header: 'الاتصال', width: 14 },
            { key: 'icvCounter', header: 'عداد ICV', width: 12 },
            { key: 'csidExpiresAt', header: 'تاريخ الانتهاء', width: 14 },
          ],
          rows: devRows,
          chartCats: devRows.map((d) => d.deviceCode),
          chartVals: devRows.map((d) => Number(d.icvCounter || 0)),
        };
        break;
      }
    }

    const totalVal = result.rows.reduce((s, r) => s + Number(r.totalAmount ?? r.total ?? 0), 0);
    const totalVat = result.rows.reduce((s, r) => s + Number(r.vatAmount ?? r.vat ?? 0), 0);
    return { ...result, summary: { count: result.rows.length, totalVal, totalVat } };
  }, [report, allInvoices, allSubs, devices]);

  if (invQuery.isLoading) return <Loading />;
  if (invQuery.error) return <ErrorState error={invQuery.error} />;

  const activeReportMeta = REPORTS.find((r) => r.id === report)!;

  return (
    <div className="space-y-5 animate-fade-in pb-14">
      <PageHeader
        title="تقارير الفوترة الإلكترونية وهيئة الزكاة (14 تقريراً شاملاً)"
        subtitle="تقارير تحليلية وتدقيقية متكاملة قابلة للتصفية والتصدير إلى Excel و PDF الملكي والطباعة المباشرة."
        actions={
          <ExportMenu
            title={`تقرير هيئة الزكاة #${activeReportMeta.num}: ${activeReportMeta.title}`}
            periodLabel={fromDate || toDate ? `الفترة: ${fromDate || '...'} إلى ${toDate || '...'}` : 'جميع الفترات'}
            columns={columns}
            data={rows}
          />
        }
      />

      {/* 14-Report Selector Grid */}
      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2">
          {REPORTS.map((r) => {
            const active = report === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setReport(r.id)}
                className={`rounded-xl border p-2.5 text-right transition-all ${
                  active
                    ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                    : 'border-slate-200 bg-slate-50/70 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                }`}
              >
                <div className={`text-[10px] font-mono font-black ${active ? 'text-indigo-200' : 'text-indigo-600 dark:text-indigo-400'}`}>
                  #{r.num} • {r.group}
                </div>
                <div className="text-xs font-extrabold mt-0.5 leading-snug">{r.title}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters & KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-6 card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">بحث</label>
            <div className="relative">
              <Search className="size-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input className="input !pr-9 text-xs" placeholder="فاتورة / عميل / فرع" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">من تاريخ</label>
            <input type="date" className="input text-xs" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">إلى تاريخ</label>
            <input type="date" className="input text-xs" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Stat label="عدد السجلات" value={String(summary.count)} tone="blue" icon={FileBarChart2} />
          <Stat label="إجمالي القيمة" value={`${money(summary.totalVal)}`} tone="green" icon={BarChart3} />
          <Stat label="إجمالي الضريبة" value={`${money(summary.totalVat)}`} tone="purple" icon={ShieldCheck} />
        </div>
      </div>

      {/* Report Chart */}
      <ExecutiveChartCard
        title={`تحليل بياني — ${activeReportMeta.title}`}
        subtitle="تمثيل مرئي لأعلى القيم والمؤشرات داخل التقرير النشط"
        icon={BarChart3}
        accent="indigo"
      >
        <ExecutiveBarChart
          categories={chartCats}
          series={[{ name: 'القيمة', data: chartVals, color: '#4f46e5' }]}
          height={220}
          unit={report === 'R13_ERRORS_LOG' || report === 'R14_COMPLIANCE_CERTS' ? '' : 'SAR'}
          emptyText="لا توجد بيانات لعرضها في هذا التقرير ضمن الفترة المختارة"
        />
      </ExecutiveChartCard>

      {/* Report Data Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
            تقرير #{activeReportMeta.num}: {activeReportMeta.title} ({rows.length} سجل)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs font-extrabold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                {columns.map((c) => (
                  <th key={c.key} className="py-3 px-4 text-right">{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-10 text-center text-sm font-semibold text-slate-500">
                    لا توجد بيانات مسجلة لهذا التقرير.
                  </td>
                </tr>
              ) : (
                rows.map((r: any, idx: number) => (
                  <tr key={r.id || idx} className="hover:bg-slate-50/75 dark:hover:bg-slate-800/40">
                    {columns.map((c) => {
                      const val = r[c.key];
                      if (c.key === 'invoiceNo' && r.id) {
                        return (
                          <td key={c.key} className="py-3 px-4 font-mono font-bold">
                            <Link to={`/zatca/invoices/${r.id}`} className="text-indigo-600 hover:underline">{val}</Link>
                          </td>
                        );
                      }
                      if (c.key === 'zatcaStatus' || c.key === 'certificateStatus') {
                        return (
                          <td key={c.key} className="py-3 px-4">
                            <Badge color={['CLEARED', 'REPORTED', 'PRODUCTION'].includes(val) ? 'green' : ['REJECTED', 'FAILED'].includes(val) ? 'red' : 'amber'}>
                              {val || '—'}
                            </Badge>
                          </td>
                        );
                      }
                      if (c.type === 'currency') {
                        return <td key={c.key} className="py-3 px-4 font-mono font-bold">{money(val || 0)}</td>;
                      }
                      if (c.key === 'issueDate') {
                        return <td key={c.key} className="py-3 px-4 text-xs">{date(val)}</td>;
                      }
                      return <td key={c.key} className="py-3 px-4 text-xs font-semibold">{val ?? '—'}</td>;
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
